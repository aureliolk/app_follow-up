import axios from 'axios';

interface SendMsgChatWootType {
    accountId: string;
    conversationId: string;
    content: any; // Pode ser string ou um objeto que será stringificado
}

export async function SendMsgChatWoot(params: SendMsgChatWootType) {
    const CHATWOOT_API_BASE_URL = 'https://app.lumibot.com.br/api/v1';
    // O token de acesso deve ser carregado de forma segura, por exemplo, de variáveis de ambiente.
    // Por enquanto, está hardcoded para fins de demonstração.
    const CHATWOOT_ACCESS_TOKEN = 'pUekDmoskUb1LTBpzP3U7H2S'; 

    const url = `${CHATWOOT_API_BASE_URL}/accounts/${params.accountId}/conversations/${params.conversationId}/messages`;

    const body = {
        content: JSON.stringify(params.content), // Stringifica o conteúdo fornecido
        message_type: "outgoing"
    };

    const headers = {
        'api_access_token': CHATWOOT_ACCESS_TOKEN,
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.post(url, body, { headers });
        console.log('Mensagem enviada para Chatwoot com sucesso:', response.data);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Erro ao enviar mensagem para Chatwoot:', error.response?.data || error.message);
            throw new Error(`Falha ao enviar mensagem para Chatwoot: ${error.response?.data?.message || error.message}`);
        } else {
            console.error('Erro inesperado ao enviar mensagem para Chatwoot:', error);
            throw new Error('Erro inesperado ao enviar mensagem para Chatwoot.');
        }
    }
}