// lib/actions/campaignActions.ts
'use server';

import { z } from 'zod'; // Para validação de dados
import { prisma } from '@/lib/db'; // Importa o Prisma Client
import { campaignQueue, CAMPAIGN_SENDER_QUEUE } from '@/lib/queues/campaignQueue'; // Importa a fila
// Importar tipos Prisma se necessário
import { Campaign } from '@prisma/client';
import { revalidatePath } from 'next/cache'; // Para limpar cache se necessário depois

// Schema para um único contato
const ContactSchema = z.object({
    identifier: z.string().min(1, 'Identificador de contato inválido.'),
    name: z.string().optional(), // Nome é opcional
});

// Definir o schema de validação para os dados de entrada da Action
const CreateCampaignSchema = z.object({
  workspaceId: z.string().uuid(), // Correção: Usar uuid() em vez de cuid()
  name: z.string().min(3, 'Nome da campanha deve ter pelo menos 3 caracteres.'),
  message: z.string().min(1, 'A mensagem não pode estar vazia.'),
  // Atualizar para esperar um array de objetos Contact
  contacts: z.array(ContactSchema).min(1, 'A lista de contatos não pode estar vazia.'), 
  sendIntervalSeconds: z.number().int().positive('O intervalo deve ser um número positivo de segundos.'),
  allowedSendStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Horário de início inválido (HH:MM).'), // Valida formato HH:MM
  allowedSendEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Horário de fim inválido (HH:MM).'),
  allowedSendDays: z.string().refine((val) => { // Valida se é um JSON array de números (0-6)
    try {
      const days = JSON.parse(val);
      return Array.isArray(days) && days.every(d => typeof d === 'number' && d >= 0 && d <= 6);
    } catch {
      return false;
    }
  }, 'Dias da semana inválidos (deve ser string JSON [0-6]).'),
  // Adicionar validação para campos de template
  isTemplate: z.boolean().optional().default(false),
  templateName: z.string().optional(),
  templateCategory: z.string().optional(),
}).refine(data => {
    // Se isTemplate for true, templateName e templateCategory são obrigatórios
    if (data.isTemplate) {
        return !!data.templateName && !!data.templateCategory;
    }
    return true; // Se não for template, não valida os outros campos
}, {
    message: "Nome e Categoria do Template são obrigatórios quando 'Usar Template HSM' está ativado.",
    path: ["templateName"], // Associar erro a um campo (opcional)
});

// Definir o tipo de retorno da Action
interface ActionResult {
  success: boolean;
  error?: string;
  campaignId?: string;
}

// A Server Action
export async function createCampaignAction(
  data: z.infer<typeof CreateCampaignSchema>
): Promise<ActionResult> {
  console.log('[ACTION] Recebido para criar campanha:', data.name, 'Contatos:', data.contacts.length);

  // 1. Validar os dados de entrada usando Zod
  const validation = CreateCampaignSchema.safeParse(data);
  if (!validation.success) {
    // Pega a primeira mensagem de erro para simplificar
    const errorMessage = validation.error.errors[0]?.message || 'Dados inválidos.';
    console.error('[ACTION ERROR] Validação falhou:', validation.error.flatten());
    return { success: false, error: errorMessage };
  }

  const {
    workspaceId,
    name,
    message,
    contacts,
    sendIntervalSeconds,
    allowedSendStartTime,
    allowedSendEndTime,
    allowedSendDays,
    isTemplate,
    templateName,
    templateCategory,
  } = validation.data;

  try {
    // 2. Verificar se o Workspace existe (e talvez permissões do usuário - não implementado aqui)
    const workspaceExists = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true } // Só precisa saber se existe
    });
    if (!workspaceExists) {
      console.error(`[ACTION ERROR] Workspace ${workspaceId} não encontrado.`);
      return { success: false, error: 'Workspace não encontrado.' };
    }

    // 3. Criar a Campanha no Banco de Dados
    console.log(`[ACTION] Criando campanha "${name}" no DB...`);
    const newCampaign = await prisma.campaign.create({
      data: {
        name,
        message,
        workspaceId,
        sendIntervalSeconds,
        allowedSendStartTime,
        allowedSendEndTime,
        allowedSendDays, // Salva a string JSON como recebida
        status: 'PENDING', // Status inicial
        // Salvar dados do template
        isTemplate: isTemplate,
        templateName: isTemplate ? templateName : null,
        templateCategory: isTemplate ? templateCategory : null,
      },
    });
    console.log(`[ACTION] Campanha ${newCampaign.id} criada.`);

    // 4. Preparar dados dos contatos para inserção em lote
    const contactData = contacts.map(contact => ({
      campaignId: newCampaign.id,
      contactInfo: contact.identifier, // Salva o identificador
      contactName: contact.name,       // Salva o nome (pode ser undefined/null)
      status: 'PENDING',
    }));

    // 5. Inserir Contatos em Lote
    console.log(`[ACTION] Inserindo ${contactData.length} contatos para campanha ${newCampaign.id}...`);
    const createManyResult = await prisma.campaignContact.createMany({
      data: contactData,
      skipDuplicates: true, // Ignora se houver contatos duplicados na lista
    });
    console.log(`[ACTION] ${createManyResult.count} contatos inseridos.`);

    // 6. Adicionar Job Inicial à Fila BullMQ
    console.log(`[ACTION] Adicionando job inicial para campanha ${newCampaign.id} à fila ${CAMPAIGN_SENDER_QUEUE}...`);
    await campaignQueue.add(CAMPAIGN_SENDER_QUEUE, { campaignId: newCampaign.id });
    console.log(`[ACTION] Job inicial adicionado para ${newCampaign.id}.`);

    // 7. Opcional: Revalidar cache de páginas que listam campanhas
    revalidatePath(`/workspace/${workspaceId}/campaigns`); // Adapte o path se for diferente

    // 8. Retornar Sucesso
    return { success: true, campaignId: newCampaign.id };

  } catch (error: any) {
    console.error('[ACTION ERROR] Erro ao criar campanha:', error);
    // Verificar erros específicos do Prisma (ex: unique constraint) se necessário
    let errorMessage = 'Falha ao criar a campanha no servidor.';
    if (error.code === 'P2002') { // Exemplo de tratamento de erro Prisma (unique constraint)
        errorMessage = 'Erro ao salvar contatos (possível duplicidade?).';
    }
    return { success: false, error: errorMessage };
  }
}