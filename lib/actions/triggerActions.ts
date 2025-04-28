
// app/workspace/[id]/mass-trigger/page.tsx
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db'; // <<< Corrigido import do Prisma
import { getServerSession } from 'next-auth/next'; // <<< Importado getServerSession
import { authOptions } from '@/lib/auth/auth-options'; // <<< Importado authOptions
import { Prisma } from '@prisma/client';
import { campaignQueue, CAMPAIGN_SENDER_QUEUE } from '@/lib/queues/campaignQueue'; // <<< Importar a fila >>>

// Schema Zod para validação (sem workspaceId, vem da sessão)
const CreateTriggerActionSchema = z.object({
  name: z.string().min(1, { message: "Nome do trigger é obrigatório." }),
  message: z.string().min(1, { message: "Mensagem é obrigatória." }), // Corpo do template
  contacts: z.array(z.object({
    identifier: z.string().min(1, { message: "Identificador do contato não pode ser vazio."}),
    name: z.string().optional(),
    variables: z.record(z.string()).optional(),
  })).min(1, { message: "Pelo menos um contato é necessário."}),
  sendIntervalSeconds: z.number().int().positive({ message: "Intervalo deve ser positivo."}),
  allowedSendStartTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "Formato de hora inválido (HH:MM)."}),
  allowedSendEndTime: z.string().regex(/^\d{2}:\d{2}$/, { message: "Formato de hora inválido (HH:MM)."}),
  allowedSendDays: z.string().refine((val) => {
      try {
          const days = JSON.parse(val);
          return Array.isArray(days) && days.every(d => typeof d === 'number' && d >= 0 && d <= 6);
      } catch { return false; }
  }, { message: "Dias permitidos inválidos."}),
  isTemplate: z.boolean(),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
});

// Tipo de entrada baseado no Schema (sem workspaceId)
type CreateTriggerActionInput = z.infer<typeof CreateTriggerActionSchema>;

export async function createTriggerAction(
    workspaceId: string,
    inputData: CreateTriggerActionInput
): Promise<{ success: boolean; error?: string; campaignId?: string }> {

  // 1. Obter usuário da sessão (APENAS para ID e autenticação)
  const session = await getServerSession(authOptions);
  // Verifica apenas se o usuário está logado
  if (!session?.user?.id) {
    console.error("Erro de Sessão: Usuário não autenticado.", session);
    return { success: false, error: "Usuário não autenticado." };
  }
  const userId = session.user.id;

  // 2. Validar input usando o schema Zod
  const validationResult = CreateTriggerActionSchema.safeParse(inputData);

  if (!validationResult.success) {
    console.error("Erro de validação na Action:", validationResult.error.flatten());
    const firstError = validationResult.error.flatten().fieldErrors;
    const errorKey = Object.keys(firstError)[0] as keyof typeof firstError;
    const errorMessage = firstError[errorKey]?.[0] || "Dados inválidos.";
    return { success: false, error: errorMessage };
  }

  const data = validationResult.data;

  console.log(`Server Action: User ${userId} in workspace ${workspaceId} creating campaign...`, data);

  try {
    // 3. Criar a Campanha no banco de dados
    const newCampaign = await prisma.campaign.create({
      data: {
        name: data.name,
        message: data.message,
        workspaceId: workspaceId, // <<< Usando workspaceId do ARGUMENTO >>>
        sendIntervalSeconds: data.sendIntervalSeconds,
        allowedSendStartTime: data.allowedSendStartTime,
        allowedSendEndTime: data.allowedSendEndTime,
        allowedSendDays: data.allowedSendDays,
        isTemplate: data.isTemplate,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
        templateCategory: null,
        status: "PENDING",
      },
    });

    console.log(`Campanha ${newCampaign.id} criada para workspace ${workspaceId}`);

    // 4. Preparar dados para CampaignContact.createMany
    const contactsToCreate: Prisma.CampaignContactCreateManyInput[] = data.contacts.map(contact => ({
        campaignId: newCampaign.id,
        contactInfo: contact.identifier,
        contactName: contact.name,
        variables: contact.variables && Object.keys(contact.variables).length > 0
            ? contact.variables as Prisma.JsonObject
            : Prisma.JsonNull,
        status: "PENDING",
    }));

    // 5. Criar os contatos associados à campanha
    const creationResult = await prisma.campaignContact.createMany({
        data: contactsToCreate,
        skipDuplicates: true,
    });

    console.log(`${creationResult.count} contatos criados para a campanha ${newCampaign.id}`);

    // TODO: Implement logic to schedule the trigger (e.g., add to BullMQ)

    // <<< Adicionar Job à fila BullMQ >>>
    try {
        await campaignQueue.add(CAMPAIGN_SENDER_QUEUE, { campaignId: newCampaign.id });
        console.log(`Job adicionado à fila ${CAMPAIGN_SENDER_QUEUE} para processar campanha ${newCampaign.id}`);
    } catch (queueError) {
        // Logar erro ao adicionar à fila, mas não necessariamente falhar a action inteira
        // pois a campanha já foi salva. Pode ser necessário um mecanismo de retry/verificação posterior.
        console.error(`Falha ao adicionar job à fila ${CAMPAIGN_SENDER_QUEUE} para campanha ${newCampaign.id}:`, queueError);
        // Poderia retornar um erro específico aqui ou adicionar um status diferente à campanha
    }

    // Revalidate the path to update the list on the frontend
    revalidatePath(`/workspace/${workspaceId}/mass-trigger`);

    return { success: true, campaignId: newCampaign.id };

  } catch (error) {
    console.error("Erro ao criar campanha/contatos no banco de dados:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
             // Tenta dar uma mensagem mais útil baseada nos campos da constraint (se possível)
             const target = error.meta?.target as string[] | undefined;
             if (target && target.includes('campaignId') && target.includes('contactInfo')) {
                return { success: false, error: "Erro: Um ou mais contatos já existem nesta campanha." };
             }
             return { success: false, error: "Erro: Violação de constraint única ao criar contatos." };
        }
    }
    return { success: false, error: "Falha ao salvar os dados da campanha no servidor." };
  }
}

// TODO: Add actions for updateTriggerAction, deleteTriggerAction, etc.

export async function deleteCampaignAction(
    campaignId: string
): Promise<{ success: boolean; error?: string }> {
    // 1. Obter usuário e workspaceId da sessão
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.error("Erro de Sessão: Usuário não autenticado para deletar campanha.");
        return { success: false, error: "Usuário não autenticado." };
    }
    const userId = session.user.id;

    console.log(`Server Action: User ${userId} attempting to delete campaign ${campaignId}`);

    try {
        // 2. Buscar a campanha para verificar a propriedade (opcional mas recomendado)
        //    Alternativamente, incluir workspaceId no deleteMany/delete
        const campaign = await prisma.campaign.findUnique({
            where: {
                id: campaignId,
            },
            select: {
                workspaceId: true, // Precisamos do workspaceId para revalidar o path correto
                // Poderíamos adicionar verificação se o usuário pertence a este workspaceId aqui
            }
        });

        if (!campaign) {
            return { success: false, error: "Campanha não encontrada." };
        }

        // TODO: Adicionar verificação de permissão mais robusta se necessário
        // Ex: Verificar se session.user.workspaceId corresponde a campaign.workspaceId
        // ou se o usuário é membro do campaign.workspaceId

        // 3. Deletar a campanha (e seus contatos associados, devido ao onDelete: Cascade no schema)
        await prisma.campaign.delete({
            where: {
                id: campaignId,
                // Poderia adicionar: workspaceId: campaign.workspaceId para segurança extra
            },
        });

        console.log(`Campanha ${campaignId} deletada com sucesso.`);

        // 4. Revalidar o path para atualizar a lista na UI
        //    Precisamos do workspaceId que pegamos da campanha antes de deletar
        if (campaign.workspaceId) {
            revalidatePath(`/workspace/${campaign.workspaceId}/mass-trigger`);
        }

        return { success: true };

    } catch (error) {
        console.error("Erro ao deletar campanha no banco de dados:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Ex: Registro não encontrado (pode acontecer se deletado concorrentemente)
             if (error.code === 'P2025') {
                 return { success: false, error: "Erro: Campanha não encontrada para exclusão." };
             }
        }
        return { success: false, error: "Falha ao excluir a campanha no servidor." };
    }
} 