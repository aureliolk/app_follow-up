export enum AIStageActionTypeEnum {
  API_CALL = 'API_CALL',
  SEND_VIDEO = 'SEND_VIDEO',
  CONNECT_CALENDAR = 'CONNECT_CALENDAR',
  TRANSFER_HUMAN = 'TRANSFER_HUMAN',
}

// Define a type for action data received from the frontend
export interface FrontendAIStageActionData {
    id?: string; // Optional for new actions
    type: AIStageActionTypeEnum; // Use the defined enum
    config: any; // Use any for config as it varies by type
    isEnabled?: boolean; // Optional, default is true
}

export interface FrontendAIStageActionDataWithOrder extends FrontendAIStageActionData {
    order: number;
}

export interface CreateAIStageData {
    name: string;
    condition: string;
    isActive?: boolean;
    dataToCollect?: string[]; // This is how we receive it from frontend form
    finalResponseInstruction?: string;
    actions?: FrontendAIStageActionDataWithOrder[]; // Use the type with order
}

// Define and export interface for API Call action config
export interface ApiCallConfig {
    apiName: string;
    url: string;
    method: string; // Should match HTTP methods (GET, POST, etc.)
    headers?: Record<string, string>; // JSON object for headers
    querySchema?: any; // JSON Schema for query parameters (not used in test call directly, but good to have type)
    bodySchema?: any; // JSON Schema for request body (not used in test call directly, but good to have type)
    responseMapping?: any; // JSON for mapping response to variables (not used in test call directly, but good to have type)
    useApiResponse?: boolean; // Checkbox to use API response (not used in test call directly)
}

// Define the AIStage type
export interface AIStage {
    id: string;
    workspaceId: string;
    name: string;
    condition: string;
    isActive: boolean;
    // Use `any` for dataToCollect for now due to JsonValue issue
    dataToCollect: any; // JsonValue from Prisma, expected to be string[] or null
    finalResponseInstruction: string | null;
    createdAt: Date;
    updatedAt: Date;
    actions?: AIStageAction[]; // Add actions here
}

// Define the AIStageAction type locally, matching the backend but with optional ID
interface AIStageAction {
    id?: string; // Optional for new actions
    type: AIStageActionTypeEnum; // Use the imported enum
    order: number;
    config: any; // Specific configuration for the action type
    isEnabled: boolean;
} 