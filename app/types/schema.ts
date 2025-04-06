// /app/follow-up/_types/schema.ts
import { z } from 'zod';

// Esquema base para FunnelStage
export const funnelStageSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome da etapa é obrigatório"),
  description: z.string().optional().nullable(),
  order: z.number().int().positive().optional().default(1),
});

// Esquema para criação
export const funnelStageCreateSchema = funnelStageSchema.omit({ id: true });

// Esquema para atualização
export const funnelStageUpdateSchema = funnelStageSchema.pick({ 
  name: true, 
  description: true,
  order: true
});

// Esquema para Step
export const funnelStepSchema = z.object({
  id: z.string().optional(),
  stage_id: z.string().min(1, "Etapa do funil é obrigatória"),
  stage_name: z.string().min(1),
  template_name: z.string().min(1, "Nome do template é obrigatório"),
  wait_time: z.string().min(1, "Tempo de espera é obrigatório"),
  message: z.string().min(1, "Mensagem é obrigatória"),
  category: z.string().optional(),
  auto_respond: z.boolean().optional().default(false),
});

// Esquema para mapping entre frontend e backend
export const funnelStepApiSchema = z.object({
  id: z.string().optional(),
  funnel_stage_id: z.string().min(1, "ID do estágio é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  template_name: z.string().min(1, "Nome do template é obrigatório"),
  wait_time: z.string().min(1, "Tempo de espera é obrigatório"),
  message_content: z.string().min(1, "Mensagem é obrigatória"),
  message_category: z.string().optional(),
  auto_respond: z.boolean().optional(),
  wait_time_ms: z.number().optional(),
});

// Extrair os tipos TypeScript dos esquemas
export type FunnelStage = z.infer<typeof funnelStageSchema>;
export type FunnelStageCreate = z.infer<typeof funnelStageCreateSchema>;
export type FunnelStageUpdate = z.infer<typeof funnelStageUpdateSchema>;
export type FunnelStep = z.infer<typeof funnelStepSchema>;
export type FunnelStepApi = z.infer<typeof funnelStepApiSchema>;

// Funções de transformação entre formatos de frontend e backend
export const mapStepToApi = (step: FunnelStep): Omit<FunnelStepApi, 'wait_time_ms'> => ({
  id: step.id,
  funnel_stage_id: step.stage_id,
  name: step.stage_name || step.template_name,
  template_name: step.template_name,
  wait_time: step.wait_time,
  message_content: step.message,
  message_category: step.category,
  auto_respond: step.auto_respond
});

export const mapApiToStep = (api: FunnelStepApi): FunnelStep => ({
  id: api.id,
  stage_id: api.funnel_stage_id,
  stage_name: api.name,
  template_name: api.template_name,
  wait_time: api.wait_time,
  message: api.message_content,
  category: api.message_category,
  auto_respond: api.auto_respond
});