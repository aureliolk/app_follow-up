// app/api/conversations/[id]/send-template/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import axios from 'axios';
import { z } from 'zod';
import { Prisma, MessageSenderType } from '@prisma/client';
import pusher from '@/lib/pusher';

// Esquema de validação para o corpo da requisição
const sendTemplateSchema = z.object({
    workspaceId: z.string().uuid("ID do Workspace inválido"),
    templateName: z.string().min(1, "Nome do template é obrigatório"),
    languageCode: z.string().min(1, "Código do idioma é obrigatório"),
    // Variáveis são um objeto onde a chave é o número (como string) e o valor é o texto
    variables: z.record(z.string()), // Chave: string (número), Valor: string
});

// Interface para os parâmetros da rota
interface RouteParams {
  params: {
    id: string; // Este é o conversationId
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    const conversationId = params.id;
    console.log(`[API POST /conversations/${conversationId}/send-template] Request received.`);

    try {
        // 1. Autenticação e Obtenção do User ID
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          console.warn(`[API POST /send-template] Unauthorized: No session found for conversation ${conversationId}`);
          return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`[API POST /send-template] User ID: ${userId}`);

        // 2. Validar Corpo da Requisição
        let validatedBody;
        try {
            const body = await req.json();
            validatedBody = sendTemplateSchema.parse(body);
            console.log(`[API POST /send-template] Validated Body:`, validatedBody);
        } catch (e) {
             if (e instanceof z.ZodError) {
                console.warn(`[API POST /send-template] Invalid request body for conversation ${conversationId}:`, e.errors);
                return NextResponse.json({ success: false, error: 'Dados inválidos', details: e.errors }, { status: 400 });
             }
             console.error(`[API POST /send-template] Error parsing request body for conversation ${conversationId}:`, e);
             return NextResponse.json({ success: false, error: 'Erro ao processar dados da requisição.' }, { status: 400 });
        }
        const { workspaceId, templateName, languageCode, variables } = validatedBody;

        // 3. Verificar Permissão (precisa enviar mensagens)
        const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ou 'AGENT'? Ajustar role conforme necessário
        if (!hasPermission) {
            console.warn(`[API POST /send-template] User ${userId} forbidden for workspace ${workspaceId}.`);
            return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
        }
        console.log(`[API POST /send-template] User ${userId} has permission.`);

        // 4. Buscar Dados da Conversa, Cliente e Workspace
        let conversationData;
        try {
            conversationData = await prisma.conversation.findUniqueOrThrow({
                where: { id: conversationId, workspace_id: workspaceId },
                select: {
                    client: {
                        select: { phone_number: true }
                    },
                    workspace: {
                        select: {
                            whatsappPhoneNumberId: true,
                            whatsappAccessToken: true,
                        }
                    }
                }
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                console.error(`[API POST /send-template] Conversation ${conversationId} not found or doesn't belong to workspace ${workspaceId}.`);
                return NextResponse.json({ success: false, error: 'Conversa não encontrada ou não pertence a este workspace.' }, { status: 404 });
            }
            console.error(`[API POST /send-template] Error fetching conversation ${conversationId}:`, e);
            throw e; // Lança para o catch externo
        }

        const recipientPhoneNumber = conversationData.client?.phone_number;
        const workspace = conversationData.workspace;
        const phoneNumberId = workspace?.whatsappPhoneNumberId;
        const encryptedToken = workspace?.whatsappAccessToken;

        if (!recipientPhoneNumber || !phoneNumberId || !encryptedToken) {
            console.error(`[API POST /send-template] Missing client phone, phone number ID, or access token for conversation ${conversationId} / workspace ${workspaceId}.`);
            return NextResponse.json({ success: false, error: 'Configuração do WhatsApp incompleta para este workspace ou cliente.' }, { status: 400 });
        }

        // 5. Descriptografar Token
        let accessToken;
        try {
            accessToken = decrypt(encryptedToken);
            if (!accessToken) throw new Error("Token descriptografado está vazio.");
        } catch (decryptionError) {
            console.error(`[API POST /send-template] Failed to decrypt token for workspace ${workspaceId}:`, decryptionError);
            return NextResponse.json({ success: false, error: 'Falha ao processar credenciais do WhatsApp.' }, { status: 500 });
        }
        console.log(`[API POST /send-template] Credentials decrypted successfully.`);

        // 6. Montar Payload para API da Meta
        // A estrutura exata depende dos componentes do seu template (HEADER, BODY, BUTTONS)
        // Este é um exemplo para um template com variáveis APENAS no BODY
        const parameters = Object.keys(variables).sort((a, b) => parseInt(a) - parseInt(b)).map(key => ({
             type: 'text',
             text: variables[key]
        }));

        const payload = {
            messaging_product: 'whatsapp',
            to: recipientPhoneNumber,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode
                },
                // A chave 'components' varia muito. Verifique a estrutura do seu template na Meta.
                // Exemplo comum para variáveis no BODY:
                components: [
                    {
                        type: 'body',
                        parameters: parameters // Array de parâmetros na ordem correta
                    }
                    // Adicionar outros componentes (HEADER, BUTTONS) se o template os tiver
                    // Exemplo HEADER com variável:
                    // {
                    //   type: 'header',
                    //   parameters: [{ type: 'text', text: 'valor_header' }]
                    // },
                    // Exemplo BUTTON com variável na URL:
                    // {
                    //   type: 'button',
                    //   sub_type: 'url',
                    //   index: '0', // Índice do botão
                    //   parameters: [{ type: 'text', text: 'parte_variavel_url' }]
                    // }
                ]
            }
        };
        console.log(`[API POST /send-template] Payload for Meta API:`, JSON.stringify(payload));

        // 7. Chamar API da Meta
        const metaApiUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
        try {
            const metaResponse = await axios.post(metaApiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[API POST /send-template] Meta API Response Status: ${metaResponse.status}`);
            console.log(`[API POST /send-template] Meta API Response Data:`, metaResponse.data);

            if (metaResponse.status >= 200 && metaResponse.status < 300 && metaResponse.data?.messages?.[0]?.id) {
                const providerMessageId = metaResponse.data.messages[0].id;
                console.log(`[API POST /send-template] Template sent successfully. Provider Message ID: ${providerMessageId}`);

                // 8. IMPLEMENTADO: Salvar mensagem no Banco de Dados
                let savedMessage;
                try {
                    const messageTimestamp = new Date();
                    // Conteúdo pode ser o nome do template ou um placeholder
                    const messageContent = `[Template Enviado: ${templateName}]`; 
                    savedMessage = await prisma.message.create({
                        data: {
                            conversation_id: conversationId,
                            sender_type: MessageSenderType.SYSTEM, // Ou AI? SYSTEM parece mais adequado para template iniciado pelo operador
                            content: messageContent,
                            timestamp: messageTimestamp,
                            providerMessageId: providerMessageId,
                            status: 'SENT', // Assume SENT pois a API da Meta deu OK
                            metadata: { 
                                templateName: templateName,
                                languageCode: languageCode,
                                variables: variables, // Guarda as variáveis usadas
                                sentByUserId: userId // Guarda quem enviou
                            } as Prisma.JsonObject,
                        },
                        select: { // Selecionar dados necessários para Pusher
                            id: true, conversation_id: true, sender_type: true,
                            content: true, timestamp: true, status: true, 
                            providerMessageId: true, metadata: true
                        }
                    });
                    console.log(`[API POST /send-template] Saved template message to DB. ID: ${savedMessage.id}`);

                    // Atualizar last_message_at da conversa
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: { last_message_at: messageTimestamp, updated_at: new Date() }
                    });
                    console.log(`[API POST /send-template] Conversation last_message_at updated.`);

                } catch (dbError) {
                    console.error(`[API POST /send-template] Error saving template message or updating conversation ${conversationId} to DB:`, dbError);
                    // Não falhar a requisição inteira, mas logar o erro.
                    // O template foi enviado, o problema foi salvar o registro.
                }

                // 9. IMPLEMENTADO: Enviar mensagem via Pusher para UI
                if (savedMessage) { // Só publica se conseguiu salvar
                    try {
                        // Canal do Workspace no Pusher
                        const pusherChannel = `private-workspace-${workspaceId}`;
                        const eventPayload = JSON.stringify({ type: 'new_message', payload: savedMessage });
                        await pusher.trigger(pusherChannel, 'new_message', eventPayload);
                        console.log(`[API POST /send-template] Evento 'new_message' enviado via Pusher para ${pusherChannel}.`);

                    } catch (publishError) {
                         console.error(`[API POST /send-template] Error triggering Pusher for message ${savedMessage.id}:`, publishError);
                    }
                }

                return NextResponse.json({ success: true, providerMessageId: providerMessageId });
            } else {
                 throw new Error(`Resposta inesperada da API da Meta: Status ${metaResponse.status}`);
            }

        } catch (metaError: any) {
            const errorMessage = metaError.response?.data?.error?.message || metaError.message || 'Erro desconhecido';
            const errorDetails = metaError.response?.data?.error;
            console.error(`[API POST /send-template] Failed to send template via Meta API: ${errorMessage}`, errorDetails || metaError);
            return NextResponse.json({
                 success: false,
                 error: `Falha ao enviar template via WhatsApp: ${errorMessage}`,
                 details: errorDetails
            }, { status: metaError.response?.status || 500 });
        }

    } catch (error: any) {
        // Erro genérico (DB, Permissão, etc.)
        console.error(`[API POST /send-template] Generic Error for conversation ${conversationId}:`, error);
        return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
}

