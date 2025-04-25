import { prisma } from '@/lib/db';
import { FollowUpStatus, Prisma } from '@prisma/client';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // Importar a fila
import { Job } from 'bullmq';

/**
 * Remove todos os jobs pendentes (waiting ou delayed) associados a um followUpId da fila sequenceStepQueue.
 * Utiliza um padrão no jobId para identificar os jobs corretos (ex: 'seq_FOLLOWUPID_step_RULEID').
 *
 * @param followUpId O ID do FollowUp cujos jobs devem ser removidos.
 * @returns Uma promessa que resolve quando a remoção for concluída.
 */
async function removeFollowUpJobsFromQueue(followUpId: string): Promise<void> {
  if (!followUpId) {
    console.warn('[FollowUpService] Tentativa de remover jobs da fila sem followUpId.');
    return;
  }

  console.log(`[FollowUpService] Removendo jobs pendentes da fila 'sequenceStepQueue' para followUpId: ${followUpId}`);

  try {
    // Padrão de ID de Job esperado: 'seq_FOLLOWUPID_step_...'
    const jobPattern = `seq_${followUpId}_step_*`;
    console.log(`[FollowUpService] Usando padrão de job: ${jobPattern}`);

    // Obter jobs em espera e atrasados que correspondem ao padrão
    const waitingJobs = await sequenceStepQueue.getJobs(['waiting'], 0, -1);
    const delayedJobs = await sequenceStepQueue.getJobs(['delayed'], 0, -1);

    const jobsToRemove: Job[] = [];

    // Filtrar jobs que correspondem ao followUpId pelo jobId
    const filterJobs = (jobs: Job[]) => {
      jobs.forEach(job => {
        if (job.id && job.id.startsWith(`seq_${followUpId}_step_`)) {
          // Verificar se jobData também corresponde (segurança extra)
          if (job.data?.followUpId === followUpId) {
             jobsToRemove.push(job);
          } else {
             console.warn(`[FollowUpService] Job ID ${job.id} corresponde ao padrão, mas job.data.followUpId (${job.data?.followUpId}) não bate com ${followUpId}. Ignorando.`);
          }
        }
      });
    };

    filterJobs(waitingJobs);
    filterJobs(delayedJobs);

    if (jobsToRemove.length > 0) {
      console.log(`[FollowUpService] Encontrados ${jobsToRemove.length} jobs para remover para followUpId ${followUpId}:`, jobsToRemove.map(j => j.id));
      // Remover cada job encontrado
      const removalPromises = jobsToRemove.map(job => {
          console.log(`[FollowUpService] Removendo job ${job.id}...`);
          // Usar job.remove() que lida com o estado atual do job
          return job.remove()
              .then(() => console.log(`[FollowUpService] Job ${job.id} removido com sucesso.`))
              .catch(removeError => console.error(`[FollowUpService] Erro ao remover job ${job.id}:`, removeError));
      });
      await Promise.all(removalPromises);
      console.log(`[FollowUpService] Tentativa de remoção de ${jobsToRemove.length} jobs concluída para followUpId ${followUpId}.`);
    } else {
      console.log(`[FollowUpService] Nenhum job pendente encontrado na fila para followUpId ${followUpId}.`);
    }
  } catch (error) {
    console.error(`[FollowUpService] Erro ao buscar ou remover jobs da fila para followUpId ${followUpId}:`, error);
    // Considerar relançar o erro ou tratar de forma específica
  }
}

/**
 * Marca um Follow-up como CONVERTED no banco de dados e remove
 * quaisquer jobs pendentes associados a ele da fila sequenceStepQueue.
 *
 * @param followUpId O ID do FollowUp a ser marcado como convertido.
 * @returns O objeto FollowUp atualizado ou null se não encontrado ou já finalizado.
 * @throws Erro se a atualização no banco de dados falhar.
 */
export async function markFollowUpConverted(followUpId: string): Promise<Prisma.FollowUpGetPayload<{ select: { id: true, status: true } }> | null> {
  console.log(`[FollowUpService] Tentando marcar follow-up ${followUpId} como CONVERTED.`);

  if (!followUpId) {
    throw new Error("FollowUp ID é obrigatório para marcar como convertido.");
  }

  // Usar transação para garantir atomicidade entre update do DB e tentativa de remoção da fila?
  // Por enquanto, faremos sequencialmente: atualiza DB, depois remove da fila.
  
  // 1. Atualizar Status no Banco de Dados
  let updatedFollowUp: Prisma.FollowUpGetPayload<{ select: { id: true, status: true } }>;
  try {
    updatedFollowUp = await prisma.followUp.update({
      where: {
        id: followUpId,
        // Garantir que só atualizamos se estiver ACTIVE ou PAUSED? Sim.
         status: { in: [FollowUpStatus.ACTIVE, FollowUpStatus.PAUSED] },
      },
      data: {
        status: FollowUpStatus.CONVERTED,
        next_sequence_message_at: null, // Limpar próximo agendamento
        updated_at: new Date(),
      },
      select: { id: true, status: true }
    });
     console.log(`[FollowUpService] Follow-up ${updatedFollowUp.id} atualizado para status ${updatedFollowUp.status} no DB.`);

  } catch (error) {
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // P2025: Record to update not found.
        console.warn(`[FollowUpService] Follow-up ${followUpId} não encontrado ou já estava em um estado final. Nenhuma atualização realizada.`);
        // Tentar buscar o estado atual para retornar informação útil
         const currentFollowUp = await prisma.followUp.findUnique({ where: { id: followUpId }, select: { id: true, status: true }});
         if (currentFollowUp) {
             console.log(`[FollowUpService] Status atual do follow-up ${followUpId}: ${currentFollowUp.status}.`);
             // Mesmo que não tenha atualizado, tentaremos remover jobs da fila para garantir limpeza.
         } else {
             console.warn(`[FollowUpService] Follow-up ${followUpId} realmente não existe.`);
             return null; // Realmente não encontrado
         }
     } else {
        console.error(`[FollowUpService] Erro ao atualizar follow-up ${followUpId} no DB:`, error);
        throw error; // Relança outros erros do Prisma ou erros inesperados
     }
     // Se chegou aqui via erro P2025 mas encontrou o registro, continua para limpar a fila
     // Define updatedFollowUp como null para indicar que a atualização não ocorreu, mas a limpeza será tentada
     updatedFollowUp = await prisma.followUp.findUnique({ where: { id: followUpId }, select: { id: true, status: true }}) as any; // Busca novamente para ter o objeto
     if (!updatedFollowUp) return null; // Segurança extra
  }


  // 2. Remover Jobs Pendentes da Fila (executa mesmo se o update não ocorreu mas o follow-up existe)
  await removeFollowUpJobsFromQueue(followUpId);

  return updatedFollowUp; // Retorna o follow-up (seja o atualizado ou o estado encontrado após P2025)
}

// TODO: Adicionar funções para:
// - markFollowUpCancelled
// - markFollowUpCompleted
// - pauseFollowUp
// - resumeFollowUp
// - startFollowUp (para inatividade)
// - startAbandonedCartFollowUp
// - findActiveFollowUpByClient

// lib/services/followUpService.ts 