// lib/google/calendarServices.ts
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

// Configurações do OAuth 2.0
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-auth/callback';

/**
 * Obtém um cliente OAuth2 autenticado para um workspace específico
 * @param workspaceId ID do workspace cujo refresh_token será usado
 * @returns Cliente OAuth2 autenticado ou null se o workspace não tiver um token
 */
export async function getGoogleAuthClient(workspaceId: string): Promise<OAuth2Client | null> {
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
      console.log(`Workspace ${workspaceId} não tem um refresh_token do Google.`);
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
    console.error('Erro ao obter cliente Google autenticado:', error);
    throw error;
  }
}

/**
 * Interface para os dados do evento a ser agendado
 */
export interface GoogleCalendarEventData {
  summary: string;           // Título do evento
  description?: string;      // Descrição do evento
  location?: string;         // Localização do evento
  startDateTime: string;     // Data/hora de início (ISO-8601)
  endDateTime: string;       // Data/hora de fim (ISO-8601)
  timeZone?: string;         // Fuso horário (ex: 'America/Sao_Paulo')
  attendees?: string[];      // Lista de e-mails dos participantes
  sendUpdates?: 'all' | 'externalOnly' | 'none'; // Enviar notificações?
}

/**
 * Agenda um evento no Google Calendar do workspace
 * @param workspaceId ID do workspace que possui a conexão com o Google
 * @param eventData Dados do evento a ser agendado
 * @returns Dados do evento criado ou null se falhar
 */
export async function scheduleGoogleEvent(
  workspaceId: string,
  eventData: GoogleCalendarEventData
): Promise<any> {
  try {
    // Obter cliente autenticado
    const authClient = await getGoogleAuthClient(workspaceId);
    if (!authClient) {
      throw new Error(`Workspace ${workspaceId} não tem uma conexão ativa com o Google Calendar.`);
    }

    // Criar cliente do Google Calendar
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    // Definir fuso horário padrão se não especificado
    const timeZone = eventData.timeZone || 'America/Sao_Paulo';

    // Montar o objeto de evento para a API do Google
    const event = {
      summary: eventData.summary,
      description: eventData.description || '',
      location: eventData.location || '',
      start: {
        dateTime: eventData.startDateTime,
        timeZone: timeZone,
      },
      end: {
        dateTime: eventData.endDateTime,
        timeZone: timeZone,
      },
      attendees: eventData.attendees?.map(email => ({ email })) || [],
      // Options para notificações por padrão (pode personalizar)
      reminders: {
        useDefault: true,
      },
    };

    // Configurar o envio de notificações
    const sendUpdates = eventData.sendUpdates || 'all';

    // Chamar a API para inserir o evento
    const response = await calendar.events.insert({
      calendarId: 'primary', // Usa o calendário principal do usuário
      requestBody: event,
      sendUpdates: sendUpdates,
    });

    console.log(`Evento criado: ${response.data.htmlLink}`);
    return response.data;
  } catch (error) {
    console.error('Erro ao agendar evento no Google Calendar:', error);
    throw error;
  }
}

/**
 * Verifica a disponibilidade do calendário em um período específico
 * @param workspaceId ID do workspace que possui a conexão com o Google
 * @param startDateTime Data/hora de início (ISO-8601)
 * @param endDateTime Data/hora de fim (ISO-8601)
 * @param timeZone Fuso horário (ex: 'America/Sao_Paulo')
 * @returns Lista de eventos existentes no período ou null se falhar
 */
export async function checkCalendarAvailability(
  workspaceId: string,
  startDateTime: string,
  endDateTime: string,
  timeZone: string = 'America/Sao_Paulo'
): Promise<any> {
  try {
    // Obter cliente autenticado
    const authClient = await getGoogleAuthClient(workspaceId);
    if (!authClient) {
      throw new Error(`Workspace ${workspaceId} não tem uma conexão ativa com o Google Calendar.`);
    }

    // Criar cliente do Google Calendar
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    // Chamar a API para buscar eventos no período
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDateTime,
      timeMax: endDateTime,
      timeZone: timeZone,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items;
    return {
      events,
      isEmpty: events?.length === 0,
      count: events?.length || 0
    };
  } catch (error) {
    console.error('Erro ao verificar disponibilidade no Google Calendar:', error);
    throw error;
  }
}


