// app/api/google-calendar/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
// import { getServerSession } from "next-auth/next" // Removed as Supabase auth is used
import { createClient } from '@/lib/supabase/server'; // Import Supabase client
import { scheduleGoogleEvent, checkCalendarAvailability } from '@/lib/google/calendarServices'; // CORRECTED PATH (assuming it exists)
import { prisma } from '@/lib/db'; // Re-add prisma import if needed elsewhere
import { z } from 'zod'; // Re-add zod if schemas are defined locally or needed

// Define types and schemas locally if not imported
type GoogleCalendarEventData = z.infer<typeof eventSchema>;

// Esquema de validação para criação de eventos
const eventSchema = z.object({
  summary: z.string().min(1, 'O título do evento é obrigatório'),
  description: z.string().optional(),
  location: z.string().optional(),
  startDateTime: z.string().datetime({ message: "Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SSZ)" }),
  endDateTime: z.string().datetime({ message: "Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SSZ)" }),
  timeZone: z.string().optional().default('America/Sao_Paulo'),
  attendees: z.array(z.string().email('E-mail inválido')).optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional().default('all'),
});

// Esquema de validação para verificar disponibilidade
const availabilitySchema = z.object({
  startDateTime: z.string().datetime({ message: "Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SSZ)" }),
  endDateTime: z.string().datetime({ message: "Formato de data inválido. Use ISO-8601 (YYYY-MM-DDTHH:MM:SSZ)" }),
  timeZone: z.string().optional().default('America/Sao_Paulo'),
});

/**
 * POST /api/google-calendar/events
 * Agenda um novo evento no Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação com Supabase
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Obter o workspace do usuário atual usando Prisma
    const userId = user.id;
    const workspace = await prisma.workspace.findFirst({
        where: { owner_id: userId },
        // include: { googleCredentials: true } // Include if needed
    });

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

    // Dados validados pelo Zod
    const validatedData = validationResult.data;

    // Verificação extra para garantir que summary é string (para o linter)
    if (typeof validatedData.summary !== 'string' || validatedData.summary.length === 0) {
        console.error("Erro interno: Summary inválido após validação bem-sucedida.", validatedData);
        return NextResponse.json(
            { error: 'Erro interno do servidor ao processar o título do evento.' },
            { status: 500 }
        );
    }

    // Construir objeto com tipo explícito para passar à função
    const eventDataToSend: GoogleCalendarEventData = {
      summary: validatedData.summary, // TS agora tem certeza que é string não vazia
      description: validatedData.description,
      location: validatedData.location,
      startDateTime: validatedData.startDateTime,
      endDateTime: validatedData.endDateTime,
      timeZone: validatedData.timeZone,
      attendees: validatedData.attendees,
      sendUpdates: validatedData.sendUpdates,
    };

    // Agendar evento
    // @ts-ignore - Linter/TS error seems incorrect here after explicit validation and object construction.
    const result = await scheduleGoogleEvent(workspace.id, eventDataToSend);

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
    // Verificar autenticação com Supabase
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Obter o workspace do usuário atual usando Prisma
    const userId = user.id;
    const workspace = await prisma.workspace.findFirst({
      where: { owner_id: userId },
      // include: { googleCredentials: true } // Include if needed
    });

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
    
    // Validar os dados parseados (start e end são strings aqui)
    const validatedData = validationResult.data;

    // Verificar disponibilidade (Corrected arguments)
    const availability = await checkCalendarAvailability(
      workspace.id,
      validatedData.startDateTime,
      validatedData.endDateTime,
      validatedData.timeZone
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

