// app/api/conversations/[id]/send-template/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import axios from 'axios';
import { z } from 'zod';
// import { getWhatsAppToken } from '@/lib/channel/whatsappUtils'; // ALREADY REMOVED
// import { sendTemplateMessage } from '@/lib/channel/whatsappSender'; // REMOVED Import
import { Prisma, MessageSenderType } from '@prisma/client';
import { checkPermission } from '@/lib/permissions';

// Esquema de validação para o corpo da requisição
const sendTemplateSchema = z.object({
    workspaceId: z.string().uuid("ID do Workspace inválido"),
    templateName: z.string().min(1, "Nome do template é obrigatório"),
    languageCode: z.string().min(2, "Código de idioma inválido"),
    components: z.array(z.any()).optional(),
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = cookies();
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.warn(`[API POST /send-template] Unauthorized: No session found.`);
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }
        const userId = user.id;

        const { id: conversationId } = await params;
        const body = await req.json();

        console.log(`POST /api/conversations/${conversationId}/send-template: Request received (User ID: ${userId})`, body);

        const validation = sendTemplateSchema.safeParse(body);
        if (!validation.success) {
            console.warn(`[API POST /send-template] Invalid request body for conversation ${conversationId}:`, validation.error.errors);
            return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
        }

        const { workspaceId, templateName, languageCode, components } = validation.data;

        // 2. Verificar Permissão
        const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
        if (!hasPermission) {
            console.warn(`[API POST /send-template] Permission denied for user ${userId} on workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
        }

        // 3. Buscar dados necessários (Conversa, Cliente, Credenciais do WhatsApp)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId, workspace_id: workspaceId },
            include: {
                client: true,
                workspace: {
                    select: {
                        whatsappPhoneNumberId: true,
                        whatsappAccessToken: true
                    }
                }
            }
        });

        if (!conversation) {
            console.warn(`[API POST /send-template] Conversation ${conversationId} not found in workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
        }

        if (!conversation.client) {
            console.error(`[API POST /send-template] Client data missing for conversation ${conversationId}`);
            return NextResponse.json({ success: false, error: 'Dados do cliente ausentes na conversa' }, { status: 500 });
        }

        if (!conversation.workspace?.whatsappPhoneNumberId || !conversation.workspace?.whatsappAccessToken) {
            console.warn(`[API POST /send-template] WhatsApp credentials (ID or Token) not found for workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Credenciais do WhatsApp incompletas para este workspace' }, { status: 400 });
        }

        // 4. Get Credentials and Decrypt Token
        const phoneNumberId = conversation.workspace.whatsappPhoneNumberId;
        const encryptedToken = conversation.workspace.whatsappAccessToken;
        let accessToken: string;
        try {
            accessToken = decrypt(encryptedToken);
            if (!accessToken) {
                throw new Error('Decrypted token is empty');
            }
        } catch (error) {
            console.error(`[API POST /send-template] Failed to decrypt WhatsApp access token for workspace ${workspaceId}:`, error);
            return NextResponse.json({ success: false, error: 'Erro ao processar token do WhatsApp' }, { status: 500 });
        }

        const apiVersion = process.env.WHATSAPP_API_VERSION || 'v19.0';

        // 5. Obter Token de Acesso do WhatsApp (descriptografado)
        const whatsappToken = accessToken;

        const recipientPhoneNumber = conversation.client.phone_number;
        if (!recipientPhoneNumber) {
            console.error(`[API POST /send-template] Recipient phone number missing for client ${conversation.client.id}`);
            return NextResponse.json({ success: false, error: 'Número de telefone do destinatário ausente' }, { status: 500 });
        }

        console.log(`[API POST /send-template] Sending template '${templateName}' to recipient for conversation ${conversationId}`);

        // 6. COMMENT OUT WhatsApp API call
        /*
        const whatsappApiResponse = await sendTemplateMessage(
            phoneNumberId,
            whatsappToken,
            recipientPhoneNumber,
            templateName,
            languageCode,
            components,
            apiVersion
        );

        if (!whatsappApiResponse.success || !whatsappApiResponse.messageId) {
            console.error('[API POST /send-template] Failed to send template via WhatsApp API:', whatsappApiResponse.error);
            const errorMessage = whatsappApiResponse.error?.message || 'Erro desconhecido da API do WhatsApp';
            const errorDetails = whatsappApiResponse.error?.details;
            const statusCode = whatsappApiResponse.error?.statusCode || 500;
            return NextResponse.json(
                { success: false, error: `Falha ao enviar template via WhatsApp: ${errorMessage}`, details: errorDetails },
                { status: statusCode }
            );
        }
        const messageId = whatsappApiResponse.messageId;
        */
       const messageId = `temp_fake_${Date.now()}`;

        console.log(`[API POST /send-template] TEMPORARY: WhatsApp call skipped. Using fake Message ID: ${messageId}`);

        // 7. Criar a mensagem no banco de dados
        const newMessage = await prisma.message.create({
            data: {
                conversation_id: conversationId,
                sender_type: MessageSenderType.SYSTEM,
                content: `Template "${templateName}" enviado.`, // Conteúdo descritivo
                providerMessageId: messageId,
                status: 'sent',
                metadata: {
                    template_name: templateName,
                    template_language: languageCode,
                    template_components: components
                }
            },
        });

        console.log('[API POST /send-template] Mensagem (sem includes) criada no banco:', newMessage.id);

        // 8. Publicar evento para atualização da UI (Usar Supabase Realtime)
        console.log("[API POST /send-template] TODO: Implement Supabase Realtime event for new message");

        // 9. Retornar sucesso
        return NextResponse.json({ success: true, message: 'Template enviado com sucesso (WhatsApp API skipped)', data: { messageId: messageId, dbMessageId: newMessage.id } });

    } catch (error: any) {
        let conversationIdForError = 'unknown';
        try {
          const awaitedParams = await params;
          conversationIdForError = awaitedParams.id;
        } catch (paramError) {
          console.error('[API POST /send-template] Error getting params in catch block:', paramError);
        }
        console.error(`[API POST /send-template] Generic Error for conversation ${conversationIdForError}:`, error);

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ success: false, error: 'Erro ao acessar o banco de dados.' }, { status: 500 });
        } else if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Dados inválidos na requisição.', details: error.errors }, { status: 400 });
        } else if (axios.isAxiosError(error)) {
            console.error("[API POST /send-template] Axios Error:", error.response?.data || error.message);
            return NextResponse.json({ success: false, error: 'Erro de comunicação ao enviar mensagem.' }, { status: error.response?.status || 503 });
        }

        return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
}
