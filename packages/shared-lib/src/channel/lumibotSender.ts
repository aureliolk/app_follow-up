// lib/channel/lumibotSender.ts
import axios from 'axios';

// Função auxiliar de envio para Lumibot (Texto Livre)
export async function enviarTextoLivreLumibot(
    accountId: string,
    conversationId: string, // Este é o channel_conversation_id
    token: string,
    content: string
): Promise<{ success: boolean; responseData: any }> {

    // Validação básica de entrada
    if (!accountId || !conversationId || !token || !content) {
        console.error("[Lumibot Sender] Parâmetros inválidos recebidos.", { accountId, conversationId: conversationId ? 'OK' : 'Faltando', token: token ? 'OK' : 'Faltando', content: content ? 'OK' : 'Faltando' });
        return { success: false, responseData: { error: "Parâmetros inválidos para envio." } };
    }

    const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    const headers = {
        'Content-Type': 'application/json',
        'api_access_token': token
    };
    // O message_type "outgoing" indica que a mensagem está saindo do Chatwoot (enviada pelo agente/bot)
    // O tipo "template" geralmente requer um ID de template específico. Usaremos "outgoing" para texto livre.
    const body = {
        content: content,
        message_type: "outgoing"
    };

    console.log(`[Lumibot Sender] Enviando Texto Livre para: ${apiUrl}`);
    console.log(`[Lumibot Sender] Payload:`, JSON.stringify(body, null, 2));
    console.log(`[Lumibot Sender] Usando Token: ${token.substring(0, 5)}...`); // Não logar o token inteiro

    try {
        const response = await axios.post(apiUrl, body, { headers });
        console.log(`[Lumibot Sender] Resposta da API Lumibot: Status ${response.status}`);

        // Usar >= 200 e < 300 para cobrir outros status de sucesso como 201, 202
        const isSuccess = response.status >= 200 && response.status < 300;
        if (!isSuccess) {
             console.warn(`[Lumibot Sender] API retornou status não-sucesso: ${response.status}`, response.data);
        }
        return { success: isSuccess, responseData: response.data };
    } catch (error: any) {
        let errorMessage = 'Erro desconhecido ao enviar mensagem para Lumibot.';
        let errorData = {};

        if (axios.isAxiosError(error)) {
            errorMessage = `Erro Axios ${error.response?.status || 'sem status'}: ${error.message}`;
            errorData = error.response?.data || { detail: error.message };
            console.error(`[Lumibot Sender] Erro Axios ao enviar Texto Livre: ${errorMessage}`, errorData);
        } else if (error instanceof Error) {
            errorMessage = error.message;
            console.error(`[Lumibot Sender] Erro geral ao enviar Texto Livre: ${errorMessage}`, error);
        } else {
            console.error('[Lumibot Sender] Erro inesperado ao enviar Texto Livre:', error);
        }

        return { success: false, responseData: errorData || { error: errorMessage } };
    }
}

// Você pode adicionar outras funções aqui se precisar enviar outros tipos de mensagem (template, etc.)