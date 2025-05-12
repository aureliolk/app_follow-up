// lib/ai/tools/googleCalendarTools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { format, isValid, startOfDay, endOfDay } from 'date-fns'; // Adicionado startOfDay e endOfDay
import { ptBR } from 'date-fns/locale';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { v4 as uuidv4 } from 'uuid';
import { followupConvert } from './followupConvert';

// Descoberta do documento para APIs usadas
// const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'; // Não é mais tão necessário com a SDK

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
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        google_refresh_token: true,
        google_access_token_expires_at: true // Você pode querer usar isso para otimizar
      }
    });

    if (!workspace || !workspace.google_refresh_token) {
      console.warn(`[GoogleCalendarTool] Workspace ${workspaceId} não tem um refresh_token do Google.`);
      return null;
    }

    if (!process.env.ENCRYPTION_KEY) {
      console.error('[GoogleCalendarTool] ENCRYPTION_KEY não definida no ambiente.');
      throw new Error('ENCRYPTION_KEY não definida no ambiente.');
    }

    const refreshToken = decrypt(workspace.google_refresh_token);
    if (!refreshToken) {
      console.error('[GoogleCalendarTool] Falha ao descriptografar o refresh_token.');
      throw new Error('Falha ao descriptografar o refresh_token.');
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-auth/callback';

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('[GoogleCalendarTool] GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não definidos no ambiente.');
      throw new Error('Credenciais do cliente Google não configuradas.');
    }

    const oAuth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    oAuth2Client.setCredentials({
      refresh_token: refreshToken
    });

    // Forçar a renovação do access_token para garantir que está fresco
    // Isso também valida o refresh_token.
    // A biblioteca faz isso automaticamente na primeira chamada se o access_token estiver expirado ou ausente,
    // mas podemos ser explícitos para capturar erros de autenticação mais cedo.
    try {
      await oAuth2Client.getAccessToken();
      console.log(`[GoogleCalendarTool] Access token obtido/renovado para workspace ${workspaceId}`);
    } catch (tokenError: any) {
      console.error(`[GoogleCalendarTool] Erro ao obter/renovar access token para workspace ${workspaceId}:`, tokenError.message);
      // Se o erro for 'invalid_grant', o refresh_token pode ter sido revogado ou estar inválido.
      if (tokenError.response?.data?.error === 'invalid_grant') {
        console.error(`[GoogleCalendarTool] Refresh token inválido para workspace ${workspaceId}. O usuário pode precisar reconectar.`);
        // Aqui você poderia, opcionalmente, limpar o refresh_token do banco de dados
        // await prisma.workspace.update({
        //   where: { id: workspaceId },
        //   data: { google_refresh_token: null, google_access_token_expires_at: null },
        // });
        return null; // Indica que a autenticação falhou
      }
      throw tokenError; // Propaga outros erros de token
    }

    return oAuth2Client;
  } catch (error) {
    console.error(`[GoogleCalendarTool] Erro crítico ao obter cliente Google autenticado para workspace ${workspaceId}:`, error);
    // Não retorne null aqui, deixe o erro ser propagado para ser tratado pela ferramenta.
    throw error;
  }
}

// ... (sua checkCalendarAvailabilityTool e scheduleCalendarEventTool permanecem aqui) ...
// COPIE SUAS FERRAMENTAS EXISTENTES AQUI PARA MANTER O ARQUIVO COMPLETO

/**
 * Ferramenta para listar eventos do Google Calendar
 */
export const listCalendarEventsTool = tool({
  description: `Lista eventos do Google Agenda do usuário para um workspace específico.
    Você pode especificar um intervalo de tempo (startDateTime, endDateTime) para filtrar os eventos.
    Se startDateTime não for fornecido, buscará a partir da data/hora atual.
    Se endDateTime não for fornecido, usará o final do dia de startDateTime (ou hoje).
    Os eventos são retornados ordenados por data de início.
    Retorna os detalhes principais de cada evento encontrado ou uma mensagem se nenhum evento for encontrado.
    Sempre use datas completas no formato YYYY-MM-DDTHH:MM:SS para startDateTime e endDateTime.`,
  parameters: z.object({
    startDateTime: z.string().optional().describe("Data e hora de início no formato ISO (YYYY-MM-DDTHH:MM:SS) para filtrar eventos. Se não fornecido, usa o início do dia atual."),
    endDateTime: z.string().optional().describe("Data e hora de fim no formato ISO (YYYY-MM-DDTHH:MM:SS) para filtrar eventos. Se não fornecido, usa o fim do dia de startDateTime (ou hoje)."),
    calendarId: z.string().optional().default('primary').describe("O ID da agenda. Padrão é 'primary' para a agenda principal do usuário."),
    maxResults: z.number().optional().default(25).describe('O número máximo de eventos a retornar. Padrão é 25.'),
    q: z.string().optional().describe('Texto de pesquisa livre nos campos do evento. Por exemplo, para procurar por "Reunião".'),
    timeZone: z.string().optional().default('America/Sao_Paulo').describe('Fuso horário para interpretação das datas, padrão "America/Sao_Paulo".'),
  }),
  execute: async ({
    startDateTime,
    endDateTime,
    calendarId = 'primary',
    maxResults = 25,
    q,
    timeZone = 'America/Sao_Paulo', // Usado para interpretar datas de entrada, a API do Google usa UTC internamente para timeMin/timeMax
  }) => {
    console.log(`[listCalendarEventsTool] Executando...`);
    if (!currentWorkspaceId) {
      console.error('[listCalendarEventsTool] WorkspaceId não configurado.');
      return 'Desculpe, não consegui identificar seu workspace para buscar os eventos. Por favor, tente novamente.'
    }
    const workspaceId = currentWorkspaceId;
    console.log(`[listCalendarEventsTool] Listando eventos para workspace ${workspaceId} com params:`, { startDateTime, endDateTime, calendarId, maxResults, q, timeZone });

    try {
      const authClient = await getGoogleAuthClient(workspaceId);
      if (!authClient) {
        console.warn(`[listCalendarEventsTool] Falha ao obter cliente autenticado para workspace ${workspaceId}.`);
        return 'Não consegui acessar sua agenda. Parece que há um problema com a conexão ao Google Calendar. Por favor, vá às Configurações > Integrações e tente reconectar sua conta Google.'
      }

      const calendar = google.calendar({ version: 'v3', auth: authClient });

      // Processar datas
      let finalTimeMin: string;
      let finalTimeMax: string;

      const now = new Date();

      if (startDateTime && isValid(new Date(startDateTime))) {
        finalTimeMin = new Date(startDateTime).toISOString();
      } else {
        finalTimeMin = startOfDay(now).toISOString();
        console.log(`[listCalendarEventsTool] startDateTime inválido ou não fornecido, usando início de hoje: ${finalTimeMin}`);
      }

      if (endDateTime && isValid(new Date(endDateTime))) {
        finalTimeMax = new Date(endDateTime).toISOString();
      } else {
        // Se endDateTime não fornecido, usar o fim do dia de startDateTime (ou hoje)
        const baseDateForEndOfDay = startDateTime && isValid(new Date(startDateTime)) ? new Date(startDateTime) : now;
        finalTimeMax = endOfDay(baseDateForEndOfDay).toISOString();
        console.log(`[listCalendarEventsTool] endDateTime inválido ou não fornecido, usando fim do dia de referência (${baseDateForEndOfDay.toISOString()}): ${finalTimeMax}`);
      }

      // Garantir que timeMax seja após timeMin
      if (new Date(finalTimeMax) <= new Date(finalTimeMin)) {
        console.warn(`[listCalendarEventsTool] timeMax (${finalTimeMax}) é anterior ou igual a timeMin (${finalTimeMin}). Ajustando timeMax para 24h após timeMin.`);
        finalTimeMax = new Date(new Date(finalTimeMin).getTime() + 24 * 60 * 60 * 1000).toISOString();
      }

      console.log(`[listCalendarEventsTool] Buscando eventos de ${finalTimeMin} a ${finalTimeMax}`);

      const requestParams: calendar_v3.Params$Resource$Events$List = {
        calendarId: calendarId,
        timeMin: finalTimeMin,
        timeMax: finalTimeMax,
        maxResults: maxResults,
        singleEvents: true, // Importante para expandir eventos recorrentes
        orderBy: 'startTime', // 'startTime' ou 'updated'
      };

      if (q) {
        requestParams.q = q;
      }

      const response = await calendar.events.list(requestParams);
      const events = response.data.items;

      if (!events || events.length === 0) {
        const noEventsMessage = q
          ? `Nenhum evento encontrado contendo "${q}" no período de ${format(new Date(finalTimeMin), 'dd/MM/yyyy HH:mm')} a ${format(new Date(finalTimeMax), 'dd/MM/yyyy HH:mm')}.`
          : `Nenhum evento encontrado no período de ${format(new Date(finalTimeMin), 'dd/MM/yyyy HH:mm')} a ${format(new Date(finalTimeMax), 'dd/MM/yyyy HH:mm')}.`;
        return {
          status: 'success',
          message: noEventsMessage,
          data: { events: [] },
          responseText: noEventsMessage
        };
      }

      const formattedEvents = events.map((event: calendar_v3.Schema$Event) => {
        const start = event.start?.dateTime || event.start?.date; // Eventos de dia inteiro usam 'date'
        const end = event.end?.dateTime || event.end?.date;

        let eventString = `- "${event.summary || '(Sem título)'}"`;
        if (start) {
          const startDateObj = new Date(start);
          eventString += ` começando em ${format(startDateObj, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
          if (event.start?.timeZone) eventString += ` (${event.start.timeZone})`;
        }
        if (end && end !== start) {
          const endDateObj = new Date(end);
          eventString += ` e terminando em ${format(endDateObj, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
        }
        if (event.location) eventString += ` em "${event.location}"`;
        if (event.hangoutLink) eventString += ` (Meet: ${event.hangoutLink})`;
        // Limitar a descrição para não sobrecarregar a IA
        if (event.description) eventString += ` Descrição: ${event.description.substring(0, 70)}${event.description.length > 70 ? '...' : ''}`;
        return {
          id: event.id,
          summary: event.summary || '(Sem título)',
          start: start,
          end: end,
          location: event.location,
          hangoutLink: event.hangoutLink,
          descriptionPreview: event.description ? `${event.description.substring(0, 70)}${event.description.length > 70 ? '...' : ''}` : undefined,
          fullDescription: event.description, // IA pode querer pedir a descrição completa depois
          eventString: eventString // String formatada para resumo rápido
        };
      });

      const summaryText = `Encontrei ${formattedEvents.length} evento(s) para você:\n${formattedEvents.map(e => e.eventString).join('\n')}`;

      return {
        status: 'success',
        message: `Foram encontrados ${formattedEvents.length} eventos.`,
        data: { events: formattedEvents },
        responseText: summaryText
      };

    } catch (error: any) {
      console.error('[listCalendarEventsTool] Erro ao listar eventos:', error);
      let userFriendlyMessage = 'Desculpe, ocorreu um erro inesperado ao tentar buscar seus eventos. Por favor, tente novamente mais tarde.';
      if (error.response?.data?.error) {
        console.error('[listCalendarEventsTool] Detalhes do erro da API Google:', error.response.data.error);
        const googleError = error.response.data.error;
        if (googleError.message) {
          userFriendlyMessage = `Erro ao acessar o Google Calendar: ${googleError.message}. Verifique sua conexão ou permissões.`;
        }
        if (googleError.status === 'UNAUTHENTICATED' || error.code === 401 || error.code === 403 || googleError.error === 'invalid_grant') {
          userFriendlyMessage = 'Não consegui acessar sua agenda. Parece que há um problema com a conexão ao Google Calendar. Por favor, vá às Configurações > Integrações e tente reconectar sua conta Google.';
        }
      } else if (error.message?.includes('ENCRYPTION_KEY') || error.message?.includes('Credenciais do cliente Google')) {
        userFriendlyMessage = 'Desculpe, estou com um problema de configuração interna e não consigo acessar o calendário no momento.';
      }

      return userFriendlyMessage
    }
  }
});



/**
 * Ferramenta para agendar evento no Google Calendar COM CRIAÇÃO DE LINK DO MEET
 */
export const scheduleCalendarEventTool = tool({
  description: `Agenda um novo evento no Google Calendar do usuário e cria automaticamente um link do Google Meet.
    IMPORTANTE: ANTES DE AGENDAR, esta ferramenta VERIFICA SE HÁ EVENTOS CONFLITANTES no horário solicitado.
    Se houver conflito, informará quais eventos estão causando o problema e NÃO agendará.
    Se o horário estiver livre, o evento será agendado com o link do Meet.
    Sempre informe ao usuário sobre o resultado (agendado com sucesso, ou conflito encontrado, ou erro).`,
  parameters: z.object({
    summary: z.string().describe('Título/assunto do evento. Seja conciso e claro.'),
    description: z.string().optional().describe('Descrição detalhada do evento. Inclua pautas ou informações relevantes.'),
    location: z.string().optional().describe('Localização física do evento, se houver. Se for online, o link do Meet será o local principal.'),
    startDateTime: z.string().describe('Data e hora de início no formato ISO (YYYY-MM-DDTHH:MM:SS). Por exemplo: "2024-08-15T14:00:00".'),
    endDateTime: z.string().optional().describe('Data e hora de fim no formato ISO (YYYY-MM-DDTHH:MM:SS). Se não fornecido, o evento durará 1 hora.'),
    timeZone: z.string().optional().default('America/Sao_Paulo').describe('Fuso horário para o evento, padrão "America/Sao_Paulo".'),
    attendees: z.array(z.string()).optional().describe('Lista de e-mails dos participantes a serem convidados.'),
    sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional().default('all').describe('Configuração para envio de notificações de convite: "all", "externalOnly", ou "none". Padrão "all".'),
    conversationId: z.string().describe('O ID da conversa atual.')
  }),
  execute: async ({
    summary,
    description,
    location,
    startDateTime,
    endDateTime,
    // timeZone = 'America/Sao_Paulo',
    attendees = [],
    sendUpdates = 'all',
    conversationId
  }) => {
    console.log(`[scheduleCalendarEventTool] Iniciando: "${summary}" para ${startDateTime}, ConvID: ${conversationId}`);
    if (!currentWorkspaceId) {
      console.error('[scheduleCalendarEventTool] WorkspaceId não configurado.');
      return {
        status: 'error',
        message: 'Erro interno: Workspace não identificado.',
        responseText: 'Desculpe, não consegui identificar seu workspace para agendar o evento. Por favor, tente novamente.'
      };
    }
    const workspaceId = currentWorkspaceId;

    if (!conversationId) {
      console.error('[scheduleCalendarEventTool] conversationId não fornecido pela IA.');
      return {
        status: 'error',
        message: 'Erro interno: ID da conversa não fornecido.',
        responseText: 'Desculpe, não consegui identificar a conversa atual para concluir a ação. Por favor, tente novamente.'
      };
    }

    try {
      const authClient = await getGoogleAuthClient(workspaceId);
      if (!authClient) {
        console.warn(`[scheduleCalendarEventTool] Falha ao obter cliente autenticado para workspace ${workspaceId}.`);
        return {
          status: 'error',
          message: `Workspace ${workspaceId} não tem uma conexão ativa com o Google Calendar ou o token é inválido. Sugira ao usuário reconectar.`,
          responseText: 'Não consegui agendar o evento. Parece que há um problema com a conexão ao Google Calendar. Por favor, vá às Configurações > Integrações e tente reconectar sua conta Google.'
        };
      }

      const calendar = google.calendar({ version: 'v3', auth: authClient });

      // --- Processamento e Validação de Datas ---
      let finalStartDateTime: string;
      let finalEndDateTime: string;

      if (!startDateTime || !isValid(new Date(startDateTime))) {
        console.error('[scheduleCalendarEventTool] startDateTime inválido:', startDateTime);
        return {
          status: 'error',
          message: 'Data de início inválida. Forneça no formato YYYY-MM-DDTHH:MM:SS.',
          responseText: 'Por favor, forneça uma data e hora de início válidas (por exemplo, "2024-08-15T14:00:00") para o evento.'
        };
      }
      finalStartDateTime = new Date(startDateTime).toISOString();

      if (endDateTime && isValid(new Date(endDateTime))) {
        finalEndDateTime = new Date(endDateTime).toISOString();
      } else {
        const startDateObj = new Date(finalStartDateTime);
        finalEndDateTime = new Date(startDateObj.getTime() + 60 * 60 * 1000).toISOString(); // +1 hora
        console.log(`[scheduleCalendarEventTool] endDateTime não fornecido/inválido, definido para 1h após o início: ${finalEndDateTime}`);
      }

      if (new Date(finalEndDateTime) <= new Date(finalStartDateTime)) {
        console.warn(`[scheduleCalendarEventTool] Data de fim (${finalEndDateTime}) <= início (${finalStartDateTime}). Ajustando.`);
        finalEndDateTime = new Date(new Date(finalStartDateTime).getTime() + 60 * 60 * 1000).toISOString();
      }
      // --- Fim do Processamento de Datas ---

      // 1. VERIFICAR DISPONIBILIDADE (FREE/BUSY) ANTES DE AGENDAR
      console.log(`[scheduleCalendarEventTool] Verificando disponibilidade de ${finalStartDateTime} a ${finalEndDateTime} no calendário 'primary'`);
      const freeBusyRequest: calendar_v3.Params$Resource$Freebusy$Query = {
        requestBody: {
          timeMin: finalStartDateTime,
          timeMax: finalEndDateTime,
          items: [{ id: 'primary' }], // Verifica o calendário primário do usuário autenticado
          // timeZone: timeZone, // O fuso horário da consulta
        },
      };

      const freeBusyResponse = await calendar.freebusy.query(freeBusyRequest);
      const busySlots = freeBusyResponse.data.calendars?.primary?.busy;

      if (busySlots && busySlots.length > 0) {
        console.warn(`[scheduleCalendarEventTool] Conflito de horário detectado. Slots ocupados:`, busySlots);
        let conflictingEventsDetails = "Você já tem compromissos neste horário.";
        try {
          // Tentar obter detalhes dos eventos conflitantes para uma mensagem melhor
          const conflictingEventsList = await calendar.events.list({
            calendarId: 'primary',
            timeMin: finalStartDateTime,
            timeMax: finalEndDateTime,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 5, // Limitar para não sobrecarregar
          });

          if (conflictingEventsList.data.items && conflictingEventsList.data.items.length > 0) {
            conflictingEventsDetails = "Você já tem os seguintes compromissos neste horário:\n" +
              conflictingEventsList.data.items.map(event => {
                const eventStart = event.start?.dateTime || event.start?.date;
                const eventEnd = event.end?.dateTime || event.end?.date;
                const startStr = eventStart ? format(new Date(eventStart), 'HH:mm', { locale: ptBR }) : 'horário de início desconhecido';
                const endStr = eventEnd ? format(new Date(eventEnd), 'HH:mm', { locale: ptBR }) : 'horário de fim desconhecido';
                return `- "${event.summary || '(Sem título)'}" (de ${startStr} a ${endStr})`;
              }).join('\n');
          }
        } catch (listError) {
          console.error("[scheduleCalendarEventTool] Erro ao buscar detalhes dos eventos conflitantes:", listError);
          // A mensagem genérica de conflito será usada
        }

        return {
          status: 'conflict',
          message: 'Conflito de horário detectado. O evento não foi agendado.',
          data: {
            busySlots: busySlots, // Informação para depuração ou lógica mais avançada
          },
          responseText: `Não é possível agendar "${summary}" neste horário. ${conflictingEventsDetails} Gostaria de tentar outro horário ou agendar mesmo assim?` // A IA pode perguntar se quer agendar mesmo assim, ou sugerir outro horário.
        };
      }

      // 2. SE NÃO HOUVER CONFLITOS, AGENDAR O EVENTO
      console.log(`[scheduleCalendarEventTool] Horário livre. Prosseguindo com o agendamento de "${summary}".`);
      const eventRequestBody: calendar_v3.Schema$Event = {
        summary: summary,
        description: description || '',
        location: location || '',
        start: { dateTime: finalStartDateTime },
        end: { dateTime: finalEndDateTime },
        attendees: attendees.map(email => ({ email })),
        reminders: { useDefault: true },
        conferenceData: {
          createRequest: {
            requestId: uuidv4(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      };

      console.log('[scheduleCalendarEventTool] Enviando requisição para criar evento:', JSON.stringify(eventRequestBody, null, 2));

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventRequestBody,
        sendUpdates: sendUpdates,
        conferenceDataVersion: 1,
      });

      const createdEvent = response.data;
      console.log(`[scheduleCalendarEventTool] Evento criado: ${createdEvent.htmlLink}`);
      if (createdEvent.hangoutLink) {
        console.log(`[scheduleCalendarEventTool] Link do Meet gerado: ${createdEvent.hangoutLink}`);
      } else {
        console.warn(`[scheduleCalendarEventTool] Link do Meet NÃO foi gerado.`);
      }

      const startDateObj = new Date(createdEvent.start!.dateTime!); // Usar ! pois esperamos que dateTime exista para eventos agendados (não dia inteiro)
      const dayDescription = format(startDateObj, "EEEE, dd 'de' MMMM", { locale: ptBR });
      const startTimeStr = format(startDateObj, "HH:mm", { locale: ptBR });

      let confirmationText = `Pronto! Agendei o evento "${createdEvent.summary}" para ${dayDescription} às ${startTimeStr}.`;
      if (createdEvent.hangoutLink) {
        confirmationText += ` Um link do Google Meet também foi criado e adicionado ao evento.`;
      }
      if (attendees && attendees.length > 0 && sendUpdates !== 'none') {
        confirmationText += ` Os convites foram enviados para os participantes.`;
      }

      // Buscar configuração do workspace para decidir sobre a conversão do follow-up
      const workspaceSettings = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { google_calendar_event_conversion_enabled: true }
      });

      if (workspaceSettings?.google_calendar_event_conversion_enabled) {
        console.log(`[scheduleCalendarEventTool] Conversão de Follow-up habilitada para Workspace ${workspaceId}. Chamando followupConvert.`);
        // Pausar IA E Converter Follow-up
        await followupConvert(workspaceId, conversationId);
      } else {
        console.log(`[scheduleCalendarEventTool] Conversão de Follow-up desabilitada para Workspace ${workspaceId}. Apenas pausando IA.`);
        // Apenas Pausar IA (importar setConversationAIStatus se necessário)
        const { setConversationAIStatus } = await import('@/lib/actions/conversationActions'); 
        try {
          await setConversationAIStatus(conversationId, false, workspaceId);
          console.log(`[scheduleCalendarEventTool] IA pausada com sucesso para ${conversationId}.`);
        } catch (statusError) {
          console.error(`[scheduleCalendarEventTool] Erro ao tentar pausar IA para ${conversationId} após agendamento (conversão desativada):`, statusError);
          // Não falhar o retorno do agendamento, apenas logar o erro da pausa.
        }
      }

      return {
        status: 'success',
        message: 'Evento agendado com sucesso!',
        data: {
          eventId: createdEvent.id,
          link: createdEvent.htmlLink,
          meetLink: createdEvent.hangoutLink,
          summary: createdEvent.summary,
          start: createdEvent.start,
          end: createdEvent.end,
          attendees: createdEvent.attendees,
          conferenceData: createdEvent.conferenceData,
        },
        responseText: confirmationText
      };

    } catch (error: any) {
      console.error('[scheduleCalendarEventTool] Erro ao agendar evento:', error);
      let userFriendlyMessage = 'Desculpe, ocorreu um erro inesperado ao tentar agendar o evento. Por favor, tente novamente mais tarde.';
      // ... (sua lógica existente de tratamento de erro específico para Google API errors, auth errors etc.)
      if (error.response?.data?.error) {
        const googleError = error.response.data.error;
        userFriendlyMessage = `Erro ao agendar no Google Calendar: ${googleError.message || 'Erro desconhecido da API'}.`;
        if (googleError.status === 'UNAUTHENTICATED' || error.code === 401 || error.code === 403 || googleError.error === 'invalid_grant') {
          userFriendlyMessage = 'Não consegui agendar o evento devido a um problema de autenticação com o Google Calendar. Por favor, verifique sua conexão nas Configurações > Integrações.';
        }
      } else if (error.message?.includes('ENCRYPTION_KEY') || error.message?.includes('Credenciais do cliente Google')) {
        userFriendlyMessage = 'Desculpe, estou com um problema de configuração interna e não consigo agendar o evento no momento.';
      }
      return {
        status: 'error',
        message: `Erro ao agendar evento: ${error.message}`,
        responseText: userFriendlyMessage
      };
    }
  }
});


