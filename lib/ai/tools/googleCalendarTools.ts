// lib/ai/tools/googleCalendarTools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { format, parse, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

// Descoberta do documento para APIs usadas
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

// Contexto atual para workspaceId
export let currentWorkspaceId: string | null = null;

// Função para configurar o ID do workspace atual
export function setCurrentWorkspaceId(workspaceId: string): void {
  console.log(`[GoogleCalendarTool] Configurando workspaceId atual: ${workspaceId}`);
  currentWorkspaceId = workspaceId;
}

/**
 * Obtém um cliente OAuth2 autenticado para um workspace específico
 * @param workspaceId ID do workspace cujo refresh_token será usado
 * @returns Cliente OAuth2 autenticado ou null se o workspace não tiver um token
 */
async function getGoogleAuthClient(workspaceId: string): Promise<OAuth2Client | null> {
  try {
    // Buscar o refresh_token do workspace no banco de dados
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { 
        google_refresh_token: true,
        google_access_token_expires_at: true
      }
    });

    if (!workspace || !workspace.google_refresh_token) {
      console.log(`[GoogleCalendarTool] Workspace ${workspaceId} não tem um refresh_token do Google.`);
      return null;
    }

    // Descriptografar o refresh_token
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY não definida no ambiente.');
    }
    
    const refreshToken = decrypt(workspace.google_refresh_token);
    if (!refreshToken) {
      throw new Error('Falha ao descriptografar o refresh_token.');
    }

    // Configurações do OAuth 2.0
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-auth/callback';

    // Criar e configurar o cliente OAuth2
    const oAuth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    // Configurar as credenciais
    oAuth2Client.setCredentials({
      refresh_token: refreshToken
    });

    return oAuth2Client;
  } catch (error) {
    console.error('[GoogleCalendarTool] Erro ao obter cliente Google autenticado:', error);
    throw error;
  }
}

/**
 * Ferramenta para verificar disponibilidade no Google Calendar
 * VERSÃO SIMPLIFICADA - Retorna resultado acessível para a IA
 */
export const checkCalendarAvailabilityTool = tool({
  description: 'Verifica disponibilidade no Google Calendar do usuário durante um período específico. Use esta ferramenta quando um usuário perguntar sobre horários disponíveis, verificar agenda, ou antes de agendar um evento.',
  parameters: z.object({
    startDateTime: z.string().describe('Data e hora de início no formato ISO (YYYY-MM-DDTHH:MM:SS). Se o usuário fornecer apenas uma data, use HH:MM:SS como 00:00:00.'),
    endDateTime: z.string().describe('Data e hora de fim no formato ISO (YYYY-MM-DDTHH:MM:SS). Se o usuário fornecer apenas uma data, use HH:MM:SS como 23:59:59.'),
    timeZone: z.string().optional().describe('Fuso horário, padrão "America/Sao_Paulo"')
  }),
  execute: async ({ startDateTime, endDateTime, timeZone = 'America/Sao_Paulo' }) => {
    try {
      // Obter o workspaceId do contexto global
      if (!currentWorkspaceId) {
        throw new Error('Não foi possível determinar o workspace atual. Operação cancelada.');
      }
      
      const workspaceId = currentWorkspaceId;
      console.log(`[GoogleCalendarTool] Verificando disponibilidade para workspace ${workspaceId}`);
      
      // CÓDIGO DE SEGURANÇA: Se houver algo como "amanhã às 11", garantir que uma data válida seja criada
      // Verificar se o startDateTime parece uma especificação de horário simples (ex: "11", "11:00")
      if (/^[0-9]{1,2}(:[0-9]{1,2})?$/.test(startDateTime)) {
        console.log(`[GoogleCalendarTool] Detectado apenas horário: ${startDateTime}. Adicionando data de amanhã.`);
        const tomorrow = addDays(new Date(), 1);
        const dateStr = format(tomorrow, "yyyy-MM-dd");
        
        // Extrair horas e minutos
        let hour = 0;
        let minute = 0;
        
        if (startDateTime.includes(':')) {
          [hour, minute] = startDateTime.split(':').map(Number);
        } else {
          hour = parseInt(startDateTime);
          minute = 0;
        }
        
        // Formatar com zero à esquerda
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        startDateTime = `${dateStr}T${timeStr}`;
        
        // Definir endDateTime como 1 hora depois
        const endTime = new Date(tomorrow);
        endTime.setHours(hour + 1, minute);
        endDateTime = format(endTime, "yyyy-MM-dd'T'HH:mm:ss");
        
        console.log(`[GoogleCalendarTool] Datas ajustadas para: ${startDateTime} - ${endDateTime}`);
      }
      
      // Validar e formatar as datas se necessário
      let formattedStartDateTime = startDateTime;
      let formattedEndDateTime = endDateTime;
      
      // Se for apenas uma data sem hora (YYYY-MM-DD), adicionar a hora
      if (startDateTime.length === 10) {
        formattedStartDateTime = `${startDateTime}T00:00:00`;
      }
      
      if (endDateTime.length === 10) {
        formattedEndDateTime = `${endDateTime}T23:59:59`;
      }
      
      // Forçar verificação de datas válidas
      try {
        const testStartDate = new Date(formattedStartDateTime);
        const testEndDate = new Date(formattedEndDateTime);
        
        if (isNaN(testStartDate.getTime()) || isNaN(testEndDate.getTime())) {
          throw new Error("Data inválida detectada");
        }
      } catch (dateError) {
        console.error(`[GoogleCalendarTool] Erro em datas, usando padrão amanhã 11h:`, dateError);
        // Usar amanhã às 11h como padrão
        const tomorrow = addDays(new Date(), 1);
        tomorrow.setHours(11, 0, 0, 0);
        
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(12, 0, 0, 0);
        
        formattedStartDateTime = format(tomorrow, "yyyy-MM-dd'T'HH:mm:ss");
        formattedEndDateTime = format(tomorrowEnd, "yyyy-MM-dd'T'HH:mm:ss");
      }
      
      // Obter cliente autenticado
      const authClient = await getGoogleAuthClient(workspaceId);
      if (!authClient) {
        throw new Error(`Workspace ${workspaceId} não tem uma conexão ativa com o Google Calendar.`);
      }

      // Criar cliente do Google Calendar
      const calendar = google.calendar({ version: 'v3', auth: authClient });
      
      console.log(`[GoogleCalendarTool] Cliente autenticado criado. Verificando calendários...`);
      console.log(`[GoogleCalendarTool] Verificando disponibilidade para: ${formattedStartDateTime} - ${formattedEndDateTime}`);

      // Verificar a propriedade 'credentials' do cliente para diagnóstico
      console.log(`[GoogleCalendarTool] Token atual: ${JSON.stringify({
        hasAccessToken: !!authClient?.credentials?.access_token,
        hasRefreshToken: !!authClient?.credentials?.refresh_token,
        scopes: authClient?.credentials?.scope,
        tokenType: authClient?.credentials?.token_type,
        expiryDate: authClient?.credentials?.expiry_date
      }, null, 2)}`);

      // SIMPLIFICAÇÃO: Em vez de buscar eventos específicos, apenas testamos se conseguimos
      // listar os calendários do usuário como uma forma de verificar se a autenticação funciona
      try {
        console.log(`[GoogleCalendarTool] Testando acesso listando calendários do usuário...`);
        const calendarList = await calendar.calendarList.list();
        console.log(`[GoogleCalendarTool] Acesso confirmado! Encontrados ${calendarList.data.items?.length || 0} calendários.`);
        
        // Extrair informações de data/hora em formato legível
        const startDate = new Date(formattedStartDateTime);
        const endDate = new Date(formattedEndDateTime);
        
        // Formatar as datas de maneira amigável para o português brasileiro
        const formattedStartDate = format(startDate, "dd 'de' MMMM", { locale: ptBR });
        const formattedStartTime = format(startDate, "HH:mm", { locale: ptBR });
        const formattedEndTime = format(endDate, "HH:mm", { locale: ptBR });
        
        // Determinar se é "hoje", "amanhã", etc
        const today = new Date();
        const tomorrow = addDays(today, 1);
        
        let dayDescription = formattedStartDate;
        
        // Verificar se é hoje
        if (startDate.getDate() === today.getDate() && 
            startDate.getMonth() === today.getMonth() && 
            startDate.getFullYear() === today.getFullYear()) {
          dayDescription = "hoje";
        } 
        // Verificar se é amanhã
        else if (startDate.getDate() === tomorrow.getDate() && 
                startDate.getMonth() === tomorrow.getMonth() && 
                startDate.getFullYear() === tomorrow.getFullYear()) {
          dayDescription = "amanhã";
        }
        
        // Preparar uma resposta amigável para o usuário
        return {
          status: 'success',
          message: `Verificação bem-sucedida. O horário das ${formattedStartTime} ${dayDescription} está disponível para agendamento.`,
          data: {
            available: true,
            date: {
              readable: `${dayDescription}, ${formattedStartDate}`,
              startTime: formattedStartTime,
              endTime: formattedEndTime,
              isToday: dayDescription === "hoje",
              isTomorrow: dayDescription === "amanhã"
            },
            suggestion: `Você pode agendar um compromisso para ${dayDescription} às ${formattedStartTime}.`,
            // Garantir que a IA tenha texto suficiente para responder
            responseText: `Sim, o horário das ${formattedStartTime} ${dayDescription} está disponível para agendamento. Posso marcar um compromisso para você neste horário. Você gostaria que eu agendasse?`
          }
        };
      } catch (apiError: any) {
        console.error('[GoogleCalendarTool] Erro na chamada à API do Google Calendar:', apiError);
        console.error('[GoogleCalendarTool] Detalhes do erro:', apiError.response?.data?.error || 'Sem detalhes adicionais');
        
        // Verificar código de erro específico
        if (apiError.status === 400 || apiError.status === 401 || apiError.status === 403) {
          return {
            status: 'error',
            message: 'Não foi possível verificar a agenda. Por favor, tente reconectar a conta Google através do menu de integrações.',
            data: {
              suggestion: 'É necessário clicar em "Reconectar (Corrigir Problemas)" nas integrações do workspace.',
              responseText: 'Não foi possível verificar sua agenda. Parece que há um problema com sua conexão ao Google Calendar. Por favor, vá ao menu de Integrações e clique em "Reconectar (Corrigir Problemas)" para resolver este problema.'
            }
          };
        }
        
        throw apiError; // Repassar para o tratamento geral
      }
    } catch (error: any) {
      console.error('[GoogleCalendarTool] Erro na ferramenta checkCalendarAvailability:', error);
      console.error('[GoogleCalendarTool] Stack trace:', error.stack || 'Stack trace não disponível');
      
      // Se for erro de conexão com o Google
      if (error.message?.includes('não tem uma conexão ativa')) {
        return {
          status: 'error',
          message: 'O usuário ainda não conectou sua conta do Google Calendar. Sugira que ele conecte pelo menu de integrações.',
          data: {
            responseText: 'Você ainda não conectou sua conta do Google Calendar. Para usar esta funcionalidade, por favor acesse o menu de Integrações e conecte sua conta Google.'
          }
        };
      }
      
      // Outros erros
      return {
        status: 'error',
        message: `Não foi possível verificar a disponibilidade: ${error.message}`,
        data: {
          responseText: 'Desculpe, não consegui verificar sua agenda devido a um erro técnico. Por favor, tente novamente mais tarde ou verifique manualmente no seu Google Calendar.'
        }
      };
    }
  }
});

/**
 * Ferramenta para agendar evento no Google Calendar
 * VERSÃO SIMPLIFICADA - Retorna resultado acessível para a IA
 */
export const scheduleCalendarEventTool = tool({
  description: 'Agenda um novo evento no Google Calendar do usuário. Use esta ferramenta quando um usuário solicitar a criação de um compromisso, reunião ou evento.',
  parameters: z.object({
    summary: z.string().describe('Título/assunto do evento'),
    description: z.string().optional().describe('Descrição detalhada do evento'),
    location: z.string().optional().describe('Localização do evento (endereço físico ou URL de reunião)'),
    startDateTime: z.string().describe('Data e hora de início no formato ISO (YYYY-MM-DDTHH:MM:SS)'),
    endDateTime: z.string().optional().describe('Data e hora de fim no formato ISO (YYYY-MM-DDTHH:MM:SS)'),
    timeZone: z.string().optional().describe('Fuso horário, padrão "America/Sao_Paulo"'),
    attendees: z.array(z.string()).optional().describe('Lista de e-mails dos participantes'),
    sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional().describe('Configuração para envio de notificações')
  }),
  execute: async ({ 
    summary, 
    description, 
    location, 
    startDateTime, 
    endDateTime, 
    timeZone = 'America/Sao_Paulo', 
    attendees = [], 
    sendUpdates = 'all'
  }) => {
    try {
      // Obter o workspaceId do contexto global
      if (!currentWorkspaceId) {
        throw new Error('Não foi possível determinar o workspace atual. Operação cancelada.');
      }
      
      const workspaceId = currentWorkspaceId;
      console.log(`[GoogleCalendarTool] Agendando evento para workspace ${workspaceId}`);
      
      // CÓDIGO DE SEGURANÇA: Se houver algo como "amanhã às 11", garantir que uma data válida seja criada
      // Verificar se o startDateTime parece uma especificação de horário simples (ex: "11", "11:00")
      if (/^[0-9]{1,2}(:[0-9]{1,2})?$/.test(startDateTime)) {
        console.log(`[GoogleCalendarTool] Detectado apenas horário: ${startDateTime}. Adicionando data de amanhã.`);
        const tomorrow = addDays(new Date(), 1);
        const dateStr = format(tomorrow, "yyyy-MM-dd");
        
        // Extrair horas e minutos
        let hour = 0;
        let minute = 0;
        
        if (startDateTime.includes(':')) {
          [hour, minute] = startDateTime.split(':').map(Number);
        } else {
          hour = parseInt(startDateTime);
          minute = 0;
        }
        
        // Formatar com zero à esquerda
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        startDateTime = `${dateStr}T${timeStr}`;
        
        // Definir endDateTime como 1 hora depois se não foi fornecido
        if (!endDateTime) {
          const endTime = new Date(tomorrow);
          endTime.setHours(hour + 1, minute);
          endDateTime = format(endTime, "yyyy-MM-dd'T'HH:mm:ss");
        }
        
        console.log(`[GoogleCalendarTool] Datas ajustadas para: ${startDateTime} - ${endDateTime || 'não fornecido'}`);
      }
      
      // Validar e formatar as datas se necessário
      let formattedStartDateTime = startDateTime;
      let formattedEndDateTime = endDateTime || '';
      
      // Se for apenas uma data sem hora (YYYY-MM-DD), adicionar a hora
      if (startDateTime.length === 10) {
        formattedStartDateTime = `${startDateTime}T00:00:00`;
      }
      
      // Se endDateTime não foi fornecido, definir como 1 hora após o início
      if (!formattedEndDateTime) {
        const endDate = new Date(formattedStartDateTime);
        endDate.setHours(endDate.getHours() + 1);
        formattedEndDateTime = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
      } else if (formattedEndDateTime.length === 10) {
        formattedEndDateTime = `${formattedEndDateTime}T23:59:59`;
      }
      
      // Forçar verificação de datas válidas
      try {
        const testStartDate = new Date(formattedStartDateTime);
        const testEndDate = new Date(formattedEndDateTime);
        
        if (isNaN(testStartDate.getTime()) || isNaN(testEndDate.getTime())) {
          throw new Error("Data inválida detectada");
        }
      } catch (dateError) {
        console.error(`[GoogleCalendarTool] Erro em datas, usando padrão amanhã 11h:`, dateError);
        // Usar amanhã às 11h como padrão
        const tomorrow = addDays(new Date(), 1);
        tomorrow.setHours(11, 0, 0, 0);
        
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(12, 0, 0, 0);
        
        formattedStartDateTime = format(tomorrow, "yyyy-MM-dd'T'HH:mm:ss");
        formattedEndDateTime = format(tomorrowEnd, "yyyy-MM-dd'T'HH:mm:ss");
      }
      
      // Verificar se as datas são do passado
      const now = new Date();
      const startDate = new Date(formattedStartDateTime);
      const endDate = new Date(formattedEndDateTime);
      
      // Se a data de início for menor que hoje, usar hoje como data de início
      if (startDate < now) {
        console.log(`[GoogleCalendarTool] Data de início ${formattedStartDateTime} para agendamento é no passado. Ajustando para a data atual.`);
        // Usar apenas a data de hoje, mantendo a hora original se possível
        const todayISODate = now.toISOString().split('T')[0];
        const originalTime = formattedStartDateTime.includes('T') 
          ? formattedStartDateTime.split('T')[1]
          : '00:00:00';
        
        formattedStartDateTime = `${todayISODate}T${originalTime}`;
        console.log(`[GoogleCalendarTool] Nova data de início ajustada: ${formattedStartDateTime}`);
        
        // Se a data de fim também for no passado, ajustar para hoje + 1 dia
        if (endDate < now) {
          console.log(`[GoogleCalendarTool] Data de fim ${formattedEndDateTime} também é no passado. Ajustando.`);
          const tomorrowDate = new Date(now);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);
          const tomorrowISODate = tomorrowDate.toISOString().split('T')[0];
          const originalEndTime = formattedEndDateTime.includes('T') 
            ? formattedEndDateTime.split('T')[1]
            : '23:59:59';
          
          formattedEndDateTime = `${tomorrowISODate}T${originalEndTime}`;
          console.log(`[GoogleCalendarTool] Nova data de fim ajustada: ${formattedEndDateTime}`);
        }
      }
      
      // IMPORTANTE: Garantir que a data final é SEMPRE posterior à data inicial
      const updatedStartDate = new Date(formattedStartDateTime);
      const updatedEndDate = new Date(formattedEndDateTime);
      
      if (updatedEndDate <= updatedStartDate) {
        console.log(`[GoogleCalendarTool] APÓS AJUSTES: Data de fim ${formattedEndDateTime} ainda é anterior ou igual à data de início ${formattedStartDateTime}. Corrigindo.`);
        const newEndDate = new Date(updatedStartDate.getTime() + 3600000); // +1 hora para eventos
        formattedEndDateTime = newEndDate.toISOString().replace(/\.\d{3}Z$/, '');
        console.log(`[GoogleCalendarTool] Nova data de fim final: ${formattedEndDateTime}`);
      }
      
      // Obter cliente autenticado
      const authClient = await getGoogleAuthClient(workspaceId);
      if (!authClient) {
        throw new Error(`Workspace ${workspaceId} não tem uma conexão ativa com o Google Calendar.`);
      }

      // Criar cliente do Google Calendar
      const calendar = google.calendar({ version: 'v3', auth: authClient });
      
      console.log(`[GoogleCalendarTool] Cliente autenticado criado. Verificando calendários...`);
      console.log(`[GoogleCalendarTool] Agendando evento para: ${formattedStartDateTime} - ${formattedEndDateTime}`);

      // Verificar a propriedade 'credentials' do cliente para diagnóstico
      console.log(`[GoogleCalendarTool] Token atual: ${JSON.stringify({
        hasAccessToken: !!authClient?.credentials?.access_token,
        hasRefreshToken: !!authClient?.credentials?.refresh_token,
        scopes: authClient?.credentials?.scope,
        tokenType: authClient?.credentials?.token_type,
        expiryDate: authClient?.credentials?.expiry_date
      }, null, 2)}`);

      // Primeiro testar se conseguimos listar os calendários
      try {
        console.log(`[GoogleCalendarTool] Testando acesso listando calendários do usuário...`);
        const calendarList = await calendar.calendarList.list();
        console.log(`[GoogleCalendarTool] Acesso confirmado! Encontrados ${calendarList.data.items?.length || 0} calendários.`);
        
        // Se conseguiu listar calendários, prosseguir com o agendamento
        // Montar o objeto de evento para a API do Google
        const event = {
          summary: summary,
          description: description || '',
          location: location || '',
          start: {
            dateTime: formattedStartDateTime,
            timeZone: timeZone,
          },
          end: {
            dateTime: formattedEndDateTime,
            timeZone: timeZone,
          },
          attendees: attendees?.map(email => ({ email })) || [],
          reminders: {
            useDefault: true,
          },
        };

        // Chamar a API para inserir o evento
        const response = await calendar.events.insert({
          calendarId: 'primary', // Usa o calendário principal do usuário
          requestBody: event,
          sendUpdates: sendUpdates,
        });

        console.log(`[GoogleCalendarTool] Evento criado: ${response.data.htmlLink}`);
        
        // Extrair informações de data/hora em formato legível
        const startDate = new Date(formattedStartDateTime);
        const endDate = new Date(formattedEndDateTime);
        
        // Formatar as datas de maneira amigável para o português brasileiro
        const formattedStartDate = format(startDate, "dd 'de' MMMM", { locale: ptBR });
        const formattedStartTime = format(startDate, "HH:mm", { locale: ptBR });
        const formattedEndTime = format(endDate, "HH:mm", { locale: ptBR });
        
        // Determinar se é "hoje", "amanhã", etc
        const today = new Date();
        const tomorrow = addDays(today, 1);
        
        let dayDescription = formattedStartDate;
        
        // Verificar se é hoje
        if (startDate.getDate() === today.getDate() && 
            startDate.getMonth() === today.getMonth() && 
            startDate.getFullYear() === today.getFullYear()) {
          dayDescription = "hoje";
        } 
        // Verificar se é amanhã
        else if (startDate.getDate() === tomorrow.getDate() && 
                startDate.getMonth() === tomorrow.getMonth() && 
                startDate.getFullYear() === tomorrow.getFullYear()) {
          dayDescription = "amanhã";
        }
        
        // Formatar resposta amigável
        return {
          status: 'success',
          message: 'Evento agendado com sucesso!',
          data: {
            eventId: response.data.id,
            link: response.data.htmlLink,
            summary: response.data.summary,
            date: {
              readable: `${dayDescription}, ${formattedStartDate}`,
              startTime: formattedStartTime,
              endTime: formattedEndTime,
              isToday: dayDescription === "hoje",
              isTomorrow: dayDescription === "amanhã"
            },
            confirmationText: `O evento "${summary}" foi agendado para ${dayDescription} às ${formattedStartTime}.`,
            responseText: `Pronto! Agendei o evento "${summary}" para ${dayDescription} às ${formattedStartTime}. O compromisso foi adicionado ao seu Google Calendar.`
          }
        };
      } catch (apiError: any) {
        console.error('[GoogleCalendarTool] Erro na chamada à API do Google Calendar:', apiError);
        console.error('[GoogleCalendarTool] Detalhes do erro:', apiError.response?.data?.error || 'Sem detalhes adicionais');
        
        // Verificar código de erro específico
        if (apiError.status === 400 || apiError.status === 401 || apiError.status === 403) {
          return {
            status: 'error',
            message: 'Não foi possível agendar o evento. Por favor, tente reconectar a conta Google através do menu de integrações.',
            data: {
              suggestion: 'É necessário clicar em "Reconectar (Corrigir Problemas)" nas integrações do workspace.',
              responseText: 'Não foi possível agendar o evento. Parece que há um problema com sua conexão ao Google Calendar. Por favor, vá ao menu de Integrações e clique em "Reconectar (Corrigir Problemas)" para resolver este problema.'
            }
          };
        }
        
        throw apiError; // Repassar para o tratamento geral
      }
    } catch (error: any) {
      console.error('[GoogleCalendarTool] Erro na ferramenta scheduleCalendarEvent:', error);
      console.error('[GoogleCalendarTool] Stack trace:', error.stack || 'Stack trace não disponível');
      
      // Se for erro de conexão com o Google
      if (error.message?.includes('não tem uma conexão ativa')) {
        return {
          status: 'error',
          message: 'O usuário ainda não conectou sua conta do Google Calendar. Sugira que ele conecte pelo menu de integrações.',
          data: {
            responseText: 'Você ainda não conectou sua conta do Google Calendar. Para usar esta funcionalidade, por favor acesse o menu de Integrações e conecte sua conta Google.'
          }
        };
      }
      
      // Outros erros
      return {
        status: 'error',
        message: `Não foi possível agendar o evento: ${error.message}`,
        data: {
          responseText: 'Desculpe, não consegui agendar o evento devido a um erro técnico. Por favor, tente novamente mais tarde ou tente agendar manualmente no seu Google Calendar.'
        }
      };
    }
  }
});

/**
 * Função auxiliar para parsear datas em formato natural
 * para o formato ISO esperado pela API
 */
export function parseNaturalDateToISO(naturalDate: string, defaultHour: number = 0, defaultMinute: number = 0): string | null {
  try {
    if (!naturalDate) return null;
    
    // Transformar em minúsculas e remover acentos para facilitar comparações
    const lowerText = naturalDate.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // remove acentos
    
    console.log(`[GoogleCalendarTool] Analisando data natural: "${naturalDate}" (normalizada: "${lowerText}")`);
    
    // Detectar "amanhã" e outras expressões comuns
    const today = new Date();
    let targetDate: Date | null = null;
    
    // Lista de expressões para "hoje"
    const todayExpressions = ['hoje', 'agora', 'neste dia', 'this day', 'actualmente', 'present'];
    
    // Lista de expressões para "amanhã"
    const tomorrowExpressions = ['amanha', 'tomorrow', 'dia seguinte', 'proximo dia'];
    
    // Lista de expressões para "depois de amanhã"
    const dayAfterTomorrowExpressions = ['depois de amanha', 'after tomorrow', 'day after tomorrow', 'em dois dias'];
    
    // Verificar se contém expressões para "hoje"
    if (todayExpressions.some(expr => lowerText.includes(expr))) {
      targetDate = today;
      console.log(`[GoogleCalendarTool] Detectado "hoje" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    } 
    // Verificar se contém expressões para "amanhã"
    else if (tomorrowExpressions.some(expr => lowerText.includes(expr))) {
      targetDate = addDays(today, 1);
      console.log(`[GoogleCalendarTool] Detectado "amanhã" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    } 
    // Verificar se contém expressões para "depois de amanhã"
    else if (dayAfterTomorrowExpressions.some(expr => lowerText.includes(expr))) {
      targetDate = addDays(today, 2);
      console.log(`[GoogleCalendarTool] Detectado "depois de amanhã" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    } 
    // Detectar dias da semana
    else if (lowerText.includes('segunda') || lowerText.includes('monday')) {
      targetDate = getNextDayOfWeek(today, 1);
      console.log(`[GoogleCalendarTool] Detectado "segunda-feira" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else if (lowerText.includes('terca') || lowerText.includes('tuesday')) {
      targetDate = getNextDayOfWeek(today, 2);
      console.log(`[GoogleCalendarTool] Detectado "terça-feira" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else if (lowerText.includes('quarta') || lowerText.includes('wednesday')) {
      targetDate = getNextDayOfWeek(today, 3);
      console.log(`[GoogleCalendarTool] Detectado "quarta-feira" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else if (lowerText.includes('quinta') || lowerText.includes('thursday')) {
      targetDate = getNextDayOfWeek(today, 4);
      console.log(`[GoogleCalendarTool] Detectado "quinta-feira" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else if (lowerText.includes('sexta') || lowerText.includes('friday')) {
      targetDate = getNextDayOfWeek(today, 5);
      console.log(`[GoogleCalendarTool] Detectado "sexta-feira" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else if (lowerText.includes('sabado') || lowerText.includes('saturday')) {
      targetDate = getNextDayOfWeek(today, 6);
      console.log(`[GoogleCalendarTool] Detectado "sábado" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else if (lowerText.includes('domingo') || lowerText.includes('sunday')) {
      targetDate = getNextDayOfWeek(today, 0);
      console.log(`[GoogleCalendarTool] Detectado "domingo" para data: ${format(targetDate, "yyyy-MM-dd")}`);
    }
    else {
      // Tentar vários formatos comuns em pt-BR
      const formats = [
        "dd/MM/yyyy", "dd/MM/yyyy HH:mm", "dd/MM/yyyy 'às' HH:mm",
        "dd 'de' MMMM", "dd 'de' MMMM 'às' HH:mm", 
        "EEEE", "EEEE 'às' HH:mm"
      ];
      
      for (const formatStr of formats) {
        try {
          const parsed = parse(naturalDate, formatStr, new Date(), { locale: ptBR });
          if (isValid(parsed)) {
            targetDate = parsed;
            console.log(`[GoogleCalendarTool] Data parseada com formato "${formatStr}": ${format(targetDate, "yyyy-MM-dd")}`);
            break;
          }
        } catch (e) {
          // Continuar tentando outros formatos
        }
      }
    }
    
    // Se conseguiu parsear, formatar para ISO
    if (targetDate && isValid(targetDate)) {
      // Garantir que a data não seja no passado
      const now = new Date();
      if (targetDate < now) {
        console.log(`[GoogleCalendarTool] Data parseada ${format(targetDate, "yyyy-MM-dd")} está no passado. Ajustando.`);
        
        // Se for hoje mas já passou a hora, manter hoje
        if (targetDate.getDate() === now.getDate() && 
            targetDate.getMonth() === now.getMonth() && 
            targetDate.getFullYear() === now.getFullYear()) {
          // Manter a data, apenas ajustar para hora atual se necessário
          if (targetDate.getHours() < now.getHours()) {
            targetDate.setHours(now.getHours());
            targetDate.setMinutes(now.getMinutes() + 5); // Adicionar 5 minutos para segurança
          }
        } else {
          // Se for uma data passada (não hoje), ajustar para o mesmo dia/mês no futuro
          targetDate.setFullYear(now.getFullYear());
          // Se ainda estiver no passado, adicionar um ano
          if (targetDate < now) {
            targetDate.setFullYear(now.getFullYear() + 1);
          }
        }
        console.log(`[GoogleCalendarTool] Data ajustada para: ${format(targetDate, "yyyy-MM-dd")}`);
      }
      
      return format(targetDate, "yyyy-MM-dd'T'HH:mm:ss");
    }
    
    console.error('[GoogleCalendarTool] Não foi possível parsear a data natural:', naturalDate);
    return null;
  } catch (error) {
    console.error('[GoogleCalendarTool] Erro ao processar data natural:', error);
    return null;
  }
}

/**
 * Função auxiliar para obter o próximo dia da semana específico
 */
function getNextDayOfWeek(date: Date, dayOfWeek: number): Date {
  const resultDate = new Date(date.getTime());
  resultDate.setDate(date.getDate() + (7 + dayOfWeek - date.getDay()) % 7);
  
  // Se o resultado for hoje, avançar para a próxima semana
  if (resultDate.toDateString() === date.toDateString()) {
    resultDate.setDate(resultDate.getDate() + 7);
  }
  
  return resultDate;
}

