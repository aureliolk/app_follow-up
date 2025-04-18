import { Worker, Job } from 'bullmq';
import { redisConnection } from '../redis';
import { CAMPAIGN_SENDER_QUEUE, campaignQueue } from '../queues/campaignQueue';
import { prisma } from '../db'; // Importa a instância nomeada do Prisma Client
import { sendWhatsappMessage } from '../channel/whatsappSender'; // <<< ADICIONAR IMPORT WHATSAPP >>>
import { decrypt } from '../encryption'; // <<< ADICIONAR IMPORT DECRYPT >>>
import { Prisma } from '@prisma/client'; // Importar tipos Prisma se necessário
import { getDay, parse, isWithinInterval, setHours, setMinutes, setSeconds, setMilliseconds, format, addDays, differenceInMilliseconds } from 'date-fns';
// Importar bibliotecas de data/hora (ex: date-fns ou dayjs) se forem usadas
// import { isWithinInterval, parseISO, nextOccurrence, /* ...outras */ } from 'date-fns';

// Definir uma interface para os dados do job (melhora a tipagem)
interface CampaignJobData {
  campaignId: string;
}

// Lógica principal de processamento do job
const processCampaignJob = async (job: Job<CampaignJobData>) => {
  const { campaignId } = job.data;
  console.log(`[WORKER] Processando job ${job.id} para Campaign ID: ${campaignId}`);

  try {
    // --- INÍCIO DA LÓGICA PRINCIPAL (a ser implementada no Passo 5 do TODO) ---

    // 1. Buscar Campaign e Workspace (+ contatos pendentes)
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        workspace: true, // Necessário para pegar o token Lumibot, etc.
        // Poderia buscar o próximo contato aqui, mas faremos em passo separado para clareza
      },
    });

    if (!campaign || !campaign.workspace) {
      throw new Error(`Campanha ${campaignId} ou Workspace associado não encontrado.`);
    }

    if (campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
       console.log(`[WORKER] Campanha ${campaignId} está ${campaign.status}. Job ${job.id} ignorado.`);
       return; // Não processa nem reagenda
    }

    // 2. Buscar UM contato pendente para esta campanha
    const nextContact = await prisma.campaignContact.findFirst({
        where: {
            campaignId: campaignId,
            status: 'PENDING',
        },
        select: { // Selecionar campos necessários
            id: true,
            contactInfo: true,
            contactName: true, // <<< Incluir nome do contato
            createdAt: true,
        },
        orderBy: {
            createdAt: 'asc', // Processa os mais antigos primeiro
        }
    });

    if (!nextContact) {
        console.log(`[WORKER] Nenhum contato pendente encontrado para Campanha ${campaignId}. Marcando como COMPLETED.`);
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED' }
        });
        return; // Campanha concluída
    }

    // 3. Verificar Janela de Tempo
    let isWithinAllowedWindow = false;
    try {
        const now = new Date(); // Hora atual do servidor
        const currentDayOfWeek = getDay(now); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

        // Parse dos dias permitidos (assumindo JSON array como "[1,2,3,4,5]")
        let allowedDaysArray: number[] = [];
        try {
            allowedDaysArray = JSON.parse(campaign.allowedSendDays);
            if (!Array.isArray(allowedDaysArray) || !allowedDaysArray.every(d => typeof d === 'number')) {
                throw new Error('Formato inválido para allowedSendDays');
            }
        } catch (parseError) {
             console.error(`[WORKER ${job.id}] Erro ao parsear allowedSendDays '${campaign.allowedSendDays}' para Campanha ${campaignId}:`, parseError);
             throw new Error(`Formato inválido dos dias permitidos (${campaign.allowedSendDays}). Deve ser um array JSON de números (0-6).`);
        }

        // Verificar se o dia da semana atual é permitido
        const isDayAllowed = allowedDaysArray.includes(currentDayOfWeek);

        if (isDayAllowed) {
            // Parse dos horários HH:MM para objetos Date no dia de HOJE
            // Nota: Isso assume que os horários são na mesma timezone do servidor onde o worker roda.
            // Para robustez com fusos horários, considere usar date-fns-tz.
            const [startHour, startMinute] = campaign.allowedSendStartTime.split(':').map(Number);
            const [endHour, endMinute] = campaign.allowedSendEndTime.split(':').map(Number);

            // Cria datas de início e fim para o dia atual com os horários definidos
            let startDate = setMilliseconds(setSeconds(setMinutes(setHours(now, startHour), startMinute), 0), 0);
            let endDate = setMilliseconds(setSeconds(setMinutes(setHours(now, endHour), endMinute), 0), 0);

            // Lidar com caso onde o horário final é no dia seguinte (ex: 20:00 - 02:00)?
            // Por simplicidade, assumimos que a janela está dentro do mesmo dia.
            // Se endDate < startDate (ex: 22:00 - 06:00), a lógica isWithinInterval pode não funcionar como esperado sem ajustes.
            // TODO: Avaliar necessidade de lidar com janelas que cruzam a meia-noite.

            // Verificar se a hora atual está dentro do intervalo
            isWithinAllowedWindow = isWithinInterval(now, { start: startDate, end: endDate });
             console.log(`[WORKER ${job.id}] Verificação Janela: Dia Permitido=${isDayAllowed}, Hora Atual=${format(now, 'HH:mm:ss')}, Janela=${campaign.allowedSendStartTime}-${campaign.allowedSendEndTime}. Dentro=${isWithinAllowedWindow}`);
        } else {
            console.log(`[WORKER ${job.id}] Verificação Janela: Dia ${currentDayOfWeek} não permitido (Permitidos: ${allowedDaysArray.join(',')}).`);
        }

    } catch (timeError) {
        console.error(`[WORKER ${job.id}] Erro ao verificar janela de tempo para Campanha ${campaignId}:`, timeError);
        // Falhar o job se não conseguir verificar a hora corretamente
        throw new Error(`Erro ao processar horários da campanha: ${timeError}`);
    }

    if (isWithinAllowedWindow) {
        console.log(`[WORKER] Dentro da janela de envio para contato ${nextContact.id}.`);

        // Atualizar status da campanha para PROCESSING se for a primeira vez
        if(campaign.status === 'PENDING') {
            await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PROCESSING' } });
        }

        // <<< INÍCIO: LÓGICA DE ENVIO WHATSAPP (Substituir Lumibot) >>>
        const whatsappToken = campaign.workspace.whatsappAccessToken;
        const whatsappPhoneId = campaign.workspace.whatsappPhoneNumberId;
        const clientPhoneNumber = nextContact.contactInfo; // Assumindo que contactInfo é o número do cliente

        if (!whatsappToken || !whatsappPhoneId || !clientPhoneNumber) {
            console.error(`[WORKER ${job.id}] Credenciais WhatsApp ou número do cliente faltando para Workspace ${campaign.workspaceId} / Contato ${nextContact.id}.`);
            // Marcar como falha e talvez pausar campanha?
            await prisma.campaignContact.update({
                where: { id: nextContact.id },
                data: { status: 'FAILED', error: 'Credenciais WhatsApp ou número do cliente ausentes no workspace/contato.' },
            });
             // Considerar pausar a campanha ou notificar admin
             // await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
            throw new Error(`Credenciais WhatsApp ou número do cliente faltando para Workspace ${campaign.workspaceId} / Contato ${nextContact.id}.`);
        }

        let decryptedAccessToken: string | null = null;
        try {
            decryptedAccessToken = decrypt(whatsappToken); // <<< Usar função decrypt importada >>>
            if (!decryptedAccessToken) throw new Error("Token de acesso WhatsApp descriptografado está vazio.");
        } catch (decryptError: any) {
             console.error(`[WORKER ${job.id}] Falha ao descriptografar token WhatsApp para Workspace ${campaign.workspaceId}:`, decryptError.message);
             await prisma.campaignContact.update({
                where: { id: nextContact.id },
                data: { status: 'FAILED', error: 'Falha ao descriptografar token de acesso WhatsApp.' },
             });
             // Considerar pausar a campanha
             throw new Error(`Falha ao descriptografar token WhatsApp: ${decryptError.message}`);
        }

        let sendSuccess = false;
        let errorMessage: string | null = null;

        // --- Lógica de Envio WhatsApp --- 
        // TODO: Implementar envio de TEMPLATE vs TEXTO LIVRE para WhatsApp
        // Por agora, vamos enviar apenas texto livre (campaign.message)

        if (campaign.isTemplate) {
            console.warn(`[WORKER ${job.id}] Envio de template WhatsApp ainda não implementado neste worker. Enviando como texto livre por enquanto.`);
            // Aqui entraria a lógica para chamar uma função como sendWhatsappTemplateMessage(...)
            // passando templateName, category, parâmetros, etc.
        }
        
        console.log(`[WORKER ${job.id}] Tentando envio via WhatsApp (Texto Livre) para ${clientPhoneNumber}...`);
        try {
            const sendResult = await sendWhatsappMessage(
                whatsappPhoneId,
                clientPhoneNumber,
                decryptedAccessToken,
                campaign.message, // Usando a mensagem da campanha
                nextContact.contactName || undefined
            );

            if (sendResult.success) {
                sendSuccess = true;
                console.log(`[WORKER ${job.id}] Mensagem enviada com sucesso via WhatsApp para contato ${nextContact.id}. Message ID: ${sendResult.wamid}`);
            } else {
                errorMessage = JSON.stringify(sendResult.error || 'Erro desconhecido no envio WhatsApp');
                console.error(`[WORKER ${job.id}] Falha ao enviar mensagem via WhatsApp para contato ${nextContact.id}. Erro:`, errorMessage);
            }
        } catch (sendError: any) {
             errorMessage = `Exceção durante envio WhatsApp: ${sendError.message}`;
             console.error(`[WORKER ${job.id}] Exceção ao enviar mensagem via WhatsApp para contato ${nextContact.id}:`, sendError);
        }
        // <<< FIM: LÓGICA DE ENVIO WHATSAPP >>>

        // 5. Atualizar Status do Contato
        if (sendSuccess) {
            await prisma.campaignContact.update({
                where: { id: nextContact.id },
                data: { status: 'SENT', sentAt: new Date() },
            });
        } else {
            await prisma.campaignContact.update({
                where: { id: nextContact.id },
                data: { status: 'FAILED', error: errorMessage },
            });
        }

        // 6. Agendar Próximo Job (se houver mais contatos)
        const remainingContacts = await prisma.campaignContact.count({
            where: { campaignId: campaignId, status: 'PENDING' }
        });

        if (remainingContacts > 0) {
            const delay = campaign.sendIntervalSeconds * 1000;
            console.log(`[WORKER] Agendando próximo job para Campanha ${campaignId} em ${delay}ms.`);
            // Adiciona novo job à fila com delay
            await campaignQueue.add(CAMPAIGN_SENDER_QUEUE, { campaignId }, { delay, jobId: `campaign_${campaignId}_contact_${nextContact.id}` });
             // console.warn(`[WORKER] Re-agendamento desabilitado temporariamente.`);
        } else {
             console.log(`[WORKER] Não há mais contatos pendentes para Campanha ${campaignId}. Finalizando.`);
              await prisma.campaign.update({
                where: { id: campaignId },
                data: { status: 'COMPLETED' }
            });
        }

    } else {
        // 7. Fora da Janela de Tempo: Reagendar
        console.log(`[WORKER ${job.id}] Fora da janela de envio para Campanha ${campaignId}. Calculando próximo envio...`);

        const now = new Date();
        const currentDayOfWeek = getDay(now);
        let allowedDaysArray: number[] = [];
        try {
             allowedDaysArray = JSON.parse(campaign.allowedSendDays).sort((a: number, b: number) => a - b);
             if (!Array.isArray(allowedDaysArray) || !allowedDaysArray.every(d => typeof d === 'number' && d >= 0 && d <= 6)) {
                throw new Error('Formato inválido para allowedSendDays');
            }
        } catch (parseError) {
            console.error(`[WORKER ${job.id}] Erro fatal ao parsear allowedSendDays '${campaign.allowedSendDays}' no reagendamento:`, parseError);
            throw new Error(`Formato inválido dos dias permitidos (${campaign.allowedSendDays})`);
        }

        // Parse da hora de início
        const [startHour, startMinute] = campaign.allowedSendStartTime.split(':').map(Number);

        // Encontrar o próximo dia permitido (incluindo hoje se a hora já passou)
        let daysToAdd = 0;
        let nextAllowedDay = -1;

        // Ordenar para facilitar a busca do próximo dia
        allowedDaysArray.sort((a, b) => a - b);

        // Procura o próximo dia permitido *a partir* do dia atual
        for (let i = 0; i < 7; i++) {
            const checkDay = (currentDayOfWeek + i) % 7;
            if (allowedDaysArray.includes(checkDay)) {
                 // Se encontrarmos um dia permitido que é HOJE, mas a hora de início JÁ PASSOU,
                 // precisamos pular para o PRÓXIMO dia permitido.
                 const startTimeToday = setMilliseconds(setSeconds(setMinutes(setHours(now, startHour), startMinute), 0), 0);
                 if (i === 0 && now >= startTimeToday) {
                    continue; // Hora de início hoje já passou, continue procurando pelo próximo dia
                 }
                 // Encontrou o próximo dia válido
                 daysToAdd = i;
                 nextAllowedDay = checkDay;
                 break;
            }
        }

        // Se não encontrou nenhum dia nos próximos 7 (improvável com validação, mas seguro verificar)
        if (nextAllowedDay === -1) {
            console.error(`[WORKER ${job.id}] Não foi possível encontrar um próximo dia permitido para Campanha ${campaignId}. Dias: ${allowedDaysArray.join(',')}`);
            throw new Error('Nenhum dia de envio válido configurado ou encontrado.');
        }

        // Calcular a data/hora exata do próximo início
        let nextStartTime = addDays(now, daysToAdd);
        nextStartTime = setMilliseconds(setSeconds(setMinutes(setHours(nextStartTime, startHour), startMinute), 0), 0);

        // Calcular o delay em milissegundos
        const delayUntilNextWindow = differenceInMilliseconds(nextStartTime, now);

        // Garantir que o delay seja positivo (caso haja alguma imprecisão mínima)
        const nextWindowDelay = Math.max(0, delayUntilNextWindow);

        console.log(`[WORKER ${job.id}] Próximo envio agendado para ${format(nextStartTime, 'yyyy-MM-dd HH:mm:ss')} (Daqui a ${Math.round(nextWindowDelay / 60000)} minutos). Delay: ${nextWindowDelay}ms.`);

        await campaignQueue.add(CAMPAIGN_SENDER_QUEUE, { campaignId }, { delay: nextWindowDelay, jobId: `campaign_${campaignId}_next_window` });
         // console.warn(`[WORKER ${job.id}] Re-agendamento por janela desabilitado temporariamente. Delay calculado: ${nextWindowDelay}ms`);
    }

    // --- FIM DA LÓGICA PRINCIPAL ---

  } catch (error: any) {
    console.error(`[WORKER ERROR] Erro ao processar job ${job.id} para Campaign ${campaignId}:`, error);
    // Lançar o erro novamente faz com que BullMQ tente novamente baseado nas `attempts`
    if (job?.attemptsMade >= (job?.opts?.attempts ?? 3)) {
        console.error(`[WORKER] Job ${job.id} falhou após ${job.attemptsMade} tentativas. Desistindo.`);
        // Marcar campanha como pausada?
        try {
            await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
        } catch (updateError) { /* ignore */ }
    }
    throw error;
  }
};

// Cria e exporta a instância do worker
export const campaignWorker = new Worker<CampaignJobData>(
  CAMPAIGN_SENDER_QUEUE,
  processCampaignJob,
  {
    connection: redisConnection,
    concurrency: 5, // Processa até 5 jobs simultaneamente (ajustar conforme necessário)
    limiter: { // Limita a taxa de processamento (ex: 10 jobs por segundo)
      max: 10,
      duration: 1000,
    },
  }
);

console.log(`[WORKER] Worker para fila ${CAMPAIGN_SENDER_QUEUE} inicializado.`);

// --- Listeners de Ciclo de Vida do Job (movidos da fila para cá) ---

campaignWorker.on('error', (err) => {
  // Erro geral no worker
  console.error(`[WORKER ERROR] Erro geral no worker ${CAMPAIGN_SENDER_QUEUE}:`, err);
});

campaignWorker.on('failed', (job, err) => {
  // Job falhou após todas as tentativas
  console.error(`[WORKER JOB FAILED] Job ${job?.id} falhou após todas as tentativas na fila ${CAMPAIGN_SENDER_QUEUE}:`, err);
  // TODO: Notificar admin, marcar campanha como FALHADA?
  // Exemplo: Marcar campanha como falhada se um job falhar definitivamente
  /*
  if (job?.data?.campaignId) {
    prisma.campaign.update({
      where: { id: job.data.campaignId },
      data: { status: 'FAILED' },
    }).catch(updateError => console.error(`Erro ao atualizar status da campanha ${job.data.campaignId} para FAILED:`, updateError));
  }
  */
});

campaignWorker.on('active', (job) => {
  // Job começou a ser processado
  console.log(`[WORKER JOB ACTIVE] Job ${job.id} iniciado pelo worker ${CAMPAIGN_SENDER_QUEUE}`);
});

campaignWorker.on('completed', (job) => {
  // Job concluído com sucesso
  console.log(`[WORKER JOB COMPLETED] Job ${job.id} concluído com sucesso pelo worker ${CAMPAIGN_SENDER_QUEUE}`);
});
