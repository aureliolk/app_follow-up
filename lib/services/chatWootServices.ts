import axios from 'axios';

interface SendMsgChatWootType {
    accountId: string;
    conversationId: string;
    content: any; // Pode ser string ou um objeto que será stringificado
}

interface GetConversationParams {
    accountId: string;
    phoneNumber: string;
}

export async function getChatwootConversationIdByPhoneNumber(params: GetConversationParams): Promise<string | null> {
    const CHATWOOT_API_BASE_URL = 'https://app.lumibot.com.br/api/v1';
    const CHATWOOT_ACCESS_TOKEN = 'pUekDmoskUb1LTBpzP3U7H2S'; // Considerar carregar de variáveis de ambiente

    const headers = {
        'api_access_token': CHATWOOT_ACCESS_TOKEN,
        'Content-Type': 'application/json'
    };

    try {
        // Passo 1: Buscar o contato pelo número de telefone
        const searchContactUrl = `${CHATWOOT_API_BASE_URL}/accounts/${params.accountId}/contacts/search?q=${params.phoneNumber}`;
        const contactResponse = await axios.get(searchContactUrl, { headers });
        
        const contacts = contactResponse.data.payload; // Contatos estão em response.data.payload
        console.log('Contatos encontrados:', contacts);

        if (!contacts || contacts.length === 0) {
            console.log(`Nenhum contato encontrado para o número ${params.phoneNumber}.`);
            return null;
        }

        const contactId = contacts[0].id; // Pega o ID do primeiro contato encontrado
        console.log(`Contato encontrado: ID ${contactId} para o número ${params.phoneNumber}.`);

        // Passo 2: Buscar as conversas associadas a este contato
        const contactConversationsUrl = `${CHATWOOT_API_BASE_URL}/accounts/${params.accountId}/contacts/${contactId}/conversations`;
        const conversationsResponse = await axios.get(contactConversationsUrl, { headers });

        const conversations = conversationsResponse.data.payload; // Conversas estão em response.data.payload
        console.log('Conversas do contato encontradas:', conversations);

        if (conversations && conversations.length > 0) {
            // Filtrar por conversas abertas ou pendentes
            const openConversation = conversations.find((conv: any) =>
                conv.status === 'open' || conv.status === 'pending'
            );
            
            if (openConversation) {
                console.log(`Conversa aberta encontrada para ${params.phoneNumber}: ${openConversation.id}`);
                return openConversation.id.toString(); // Retorna o ID da conversa
            } else {
                console.log(`Nenhuma conversa aberta encontrada para ${params.phoneNumber}.`);
                return null;
            }
        } else {
            console.log(`Nenhuma conversa encontrada para o contato ${contactId}.`);
            return null;
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Erro ao buscar conversa no Chatwoot:', error.response?.data || error.message);
            throw new Error(`Falha ao buscar conversa no Chatwoot: ${error.response?.data?.message || error.message}`);
        } else {
            console.error('Erro inesperado ao buscar conversa no Chatwoot:', error);
            throw new Error('Erro inesperado ao buscar conversa no Chatwoot.');
        }
    }
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