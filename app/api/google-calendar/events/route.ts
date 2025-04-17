// app/api/google-calendar/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { 
  scheduleGoogleEvent, 
  checkCalendarAvailability,
  GoogleCalendarEventData
} from '@/lib/google/calendarServices';
import { prisma } from '@/lib/db';

// Esquema de validação para criação de eventos
const eventSchema = z.object({
  summary: z.string().min(1, 'O título do evento é obrigatório'),
  description: z.string().optional(),
  location: z.string().optional(),
  startDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SS)'),
  endDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SS)'),
  timeZone: z.string().optional().default('America/Sao_Paulo'),
  attendees: z.array(z.string().email('E-mail inválido')).optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional().default('all'),
});

// Esquema de validação para verificar disponibilidade
const availabilitySchema = z.object({
  startDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SS)'),
  endDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SS)'),
  timeZone: z.string().optional().default('America/Sao_Paulo'),
});

/**
 * Função para obter o workspace pelo ID do usuário
 */
async function getWorkspaceByUserId(userId: string) {
  return prisma.workspace.findFirst({
    where: { owner_id: userId }
  });
}

/**
 * POST /api/google-calendar/events
 * Agenda um novo evento no Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    const session = await getServerSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Obter o workspace do usuário atual
    const userId = session.user.id as string;
    const workspace = await getWorkspaceByUserId(userId);
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace não encontrado' },
        { status: 404 }
      );
    }

    // Processar corpo da requisição
    const body = await request.json();
    
    // Validar dados do evento
    const validationResult = eventSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }

    // Dados validados
    const eventData = validationResult.data as GoogleCalendarEventData;
    
    // Agendar evento
    const result = await scheduleGoogleEvent(workspace.id, eventData);
    
    return NextResponse.json({
      message: 'Evento agendado com sucesso',
      event: result
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('Erro ao agendar evento:', error);
    
    if (error.message?.includes('não tem uma conexão ativa')) {
      return NextResponse.json(
        { error: 'Conta do Google não conectada' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Erro ao agendar evento', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/google-calendar/events
 * Verifica disponibilidade no Google Calendar
 */
export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação
    const session = await getServerSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Obter o workspace do usuário atual
    const userId = session.user.id as string;
    const workspace = await getWorkspaceByUserId(userId);
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace não encontrado' },
        { status: 404 }
      );
    }

    // Obter parâmetros da URL
    const { searchParams } = new URL(request.url);
    const startDateTime = searchParams.get('startDateTime');
    const endDateTime = searchParams.get('endDateTime');
    const timeZone = searchParams.get('timeZone') || 'America/Sao_Paulo';
    
    // Validar parâmetros
    if (!startDateTime || !endDateTime) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: startDateTime, endDateTime' },
        { status: 400 }
      );
    }
    
    // Validar formato das datas
    const validationResult = availabilitySchema.safeParse({
      startDateTime,
      endDateTime,
      timeZone
    });
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    // Verificar disponibilidade
    const availability = await checkCalendarAvailability(
      workspace.id,
      startDateTime,
      endDateTime,
      timeZone
    );
    
    return NextResponse.json({
      available: availability.isEmpty,
      events: availability.events,
      count: availability.count
    });
    
  } catch (error: any) {
    console.error('Erro ao verificar disponibilidade:', error);
    
    if (error.message?.includes('não tem uma conexão ativa')) {
      return NextResponse.json(
        { error: 'Conta do Google não conectada' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Erro ao verificar disponibilidade', details: error.message },
      { status: 500 }
    );
  }
}

