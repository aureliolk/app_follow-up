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

// Função auxiliar de envio usndo templte oficial do whatsapp Lumibot (HSM)
export async function sendTemplateWhatsappOficialLumibot(
    accountId: string,
    conversationId: string, // clientId
    token: string,
    stepData: {
      message_content: string;    // Conteúdo base do template
      template_name: string;      // Nome EXATO do HSM aprovado
      category: string;           // Categoria do template
    },
    clientName: string // Nome real do cliente para usar em {{1}}
  ): Promise<{ success: boolean, responseData: any }> {
  
    const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    const headers = { 'Content-Type': 'application/json', 'api_access_token': token };
  
    // --- Montando o corpo ---
    const body: any = {
      content: stepData.message_content,
      message_type: "outgoing",
      template_params: {
        name: stepData.template_name,
        category: stepData.category || "UTILITY",
        language: "pt_BR",
      }
    };
  
    // Adiciona processed_params APENAS se a mensagem contiver {{1}} e clientName for válido
    if (stepData.message_content.includes('{{1}}') && clientName) {
      body.template_params.processed_params = { "1": clientName };
    }
    // --- Fim da montagem do corpo ---
  
    console.log(`[Lumibot Processor] Enviando HSM: ${apiUrl}, Payload:`, JSON.stringify(body));
    try {
      const response = await axios.post(apiUrl, body, { headers });
      console.log(`[Lumibot Processor] Resposta Lumibot (HSM): Status ${response.status}`);
      return { success: response.status >= 200 && response.status < 300, responseData: response.data };
    } catch (err: any) {
      console.error(`[Lumibot Processor] Erro ao enviar HSM (${stepData.template_name}): ${err.message}`, err.response?.data);
      return { success: false, responseData: err.response?.data || { error: err.message } };
    }
  }

// Você pode adicionar outras funções aqui se precisar enviar outros tipos de mensagem (template, etc.)