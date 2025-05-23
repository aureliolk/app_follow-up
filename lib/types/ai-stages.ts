// Enum para os tipos de ações de um estágio
export enum AIStageActionTypeEnum {
    API_CALL = 'API_CALL',
    SEND_MESSAGE = 'SEND_MESSAGE',
    // TODO: Add other types as needed
}

// Interface base para as configurações de qualquer ação
// Usamos 'any' aqui temporariamente para contornar problemas de serialização JsonValue
// O backend/service layer deve lidar com a validação e tipagem mais precisa.
export interface BaseActionConfig extends Record<string, any> {}

// Interface para os dados de configuração de uma chamada API
export interface ApiCallConfig extends BaseActionConfig {
    apiName?: string;
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, any>;
    querySchema?: any; // JSON Schema
    bodySchema?: any; // JSON Schema
    responseMapping?: Record<string, string>;
    useApiResponse?: boolean;
    schemas?: {
        request?: string;
        response?: string;
    };
    mapping?: {
      request?: string;
      response?: string;
    }
}

// Interface para os dados de configuração de uma ação de enviar mensagem
export interface SendMessageConfig extends BaseActionConfig {
  message: string;
  // TODO: Add other message options (e.g., attachments, rich text)
}

// Union type para todas as possíveis configurações de ação
export type AIStageActionConfig = ApiCallConfig | SendMessageConfig | BaseActionConfig;

// Interface para os dados básicos de uma ação no frontend (para formulário)
export interface FrontendAIStageActionData {
    id?: string; // Optional for existing actions
    type: AIStageActionTypeEnum;
    // Usamos AIStageActionConfig que usa 'any' internamente para config
    config: AIStageActionConfig; 
    isEnabled?: boolean; // Optional, default is true
    order: number; // Incluir order aqui para o formulário
    // name?: string; // Optional, maybe for UI
}

// Interface para um estágio no frontend (para formulário)
export interface FrontendAIStageData {
    id?: string; // Optional for new stages
    name: string;
    condition: string;
    finalResponseInstruction?: string | null; // Pode ser nulo no DB
    isActive: boolean;
    actions: FrontendAIStageActionData[]; // Usa a interface atualizada de ação
    dataToCollect?: string[] | null; // Pode ser nulo no DB, array de strings
}

// Re-exportar tipos do Prisma que são usados diretamente no backend/service
export { AIStageActionType } from "@prisma/client";
export type { AIStage as PrismaAIStage, AIStageAction } from "@prisma/client"; 