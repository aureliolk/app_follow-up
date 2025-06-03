import { prisma } from '@/lib/db';
import { CustomHttpTool, HttpMethod } from '@prisma/client';
import { 
  checkCalendarAvailabilityTool, 
  scheduleCalendarEventTool,
  setCurrentWorkspaceId // Importante manter para configurar o ID
} from '@/lib/ai/tools/googleCalendarTools';
import { humanTransferTool } from '@/lib/ai/tools/humanTransferTool';
import { Tool } from 'ai';
import { z, ZodTypeAny } from 'zod';
import axios, { AxiosRequestConfig } from 'axios';
import { Prisma } from '@prisma/client'; // Para Prisma.JsonValue

/**
 * Verifica se o workspace tem uma conexão Google válida.
 * @param workspaceId ID do Workspace
 * @returns boolean
 */
async function hasGoogleConnection(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { google_refresh_token: true }
    });
    // Considera conectado se tiver um refresh token
    return !!workspace?.google_refresh_token;
  } catch (error) {
    console.error(`[toolLoader] Erro ao verificar conexão Google para workspace ${workspaceId}:`, error);
    return false;
  }
}

// <<< Função Auxiliar: JSON Schema (Básico) para Zod >>>
function jsonSchemaToZodBasic(schema: Prisma.JsonValue | null): z.ZodObject<any> {
    // Retorna um schema vazio se não houver schema definido ou não for objeto
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        // Permite qualquer input se não houver schema definido
        return z.object({}).passthrough(); 
    }

    // Verifica a estrutura básica esperada
    if (schema.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null) {
        console.warn("[jsonSchemaToZodBasic] Schema inválido ou não suportado (esperado type:object com properties):", schema);
        return z.object({}).passthrough();
    }

    const zodShape: Record<string, ZodTypeAny> = {};
    const properties = schema.properties as Record<string, { type: string; description?: string }>;
    const requiredFields = Array.isArray(schema.required) ? schema.required : [];

    for (const key in properties) {
        const prop = properties[key];
        let zodType: ZodTypeAny;

        // Mapeamento básico de tipos
        switch (prop.type) {
            case 'string':
                zodType = z.string();
                break;
            case 'number':
            case 'integer':
                zodType = z.number();
                break;
            case 'boolean':
                zodType = z.boolean();
                break;
            default:
                console.warn(`[jsonSchemaToZodBasic] Tipo não suportado "${prop.type}" para a propriedade "${key}". Usando z.any().`);
                zodType = z.any(); // Fallback para tipos não suportados
        }
        
        // Adicionar descrição se existir
        if (prop.description) {
            zodType = zodType.describe(prop.description);
        }

        // Marcar como opcional se não estiver em requiredFields
        if (!requiredFields.includes(key)) {
            zodType = zodType.optional();
        }

        zodShape[key] = zodType;
    }

    return z.object(zodShape);
}

// Função para gerar Tool dinamicamente (Refinada)
function createDynamicHttpTool(toolData: CustomHttpTool): Tool<any, any> {
  console.log(`[toolLoader] Criando ferramenta dinâmica para: ${toolData.name}`);
  
  // Determinar qual schema usar para os parâmetros da ferramenta Zod
  // Se for GET/DELETE, prioriza queryParametersSchema, senão requestBodySchema
  const primarySchemaJson = (toolData.method === HttpMethod.GET || toolData.method === HttpMethod.DELETE) 
                            ? toolData.queryParametersSchema 
                            : toolData.requestBodySchema;
                            
  const parametersSchema = jsonSchemaToZodBasic(primarySchemaJson);
  console.log(`[toolLoader] Schema Zod gerado para ${toolData.name}:`, parametersSchema.shape);

  return {
    description: toolData.description,
    parameters: parametersSchema,
    execute: async (args: Record<string, any>) => {
      console.log(`[Tool:${toolData.name}] Executando com args:`, args);
      try {
        // TODO: Implementar substituição segura de placeholders em headers (ex: {{API_KEY}})
        const headers = toolData.headers && typeof toolData.headers === 'object' 
                        ? JSON.parse(JSON.stringify(toolData.headers)) 
                        : {};
        let url = toolData.url;
        const method = toolData.method;

        // Substituir placeholders na URL (ex: /users/{userId})
        let processedUrl = url;
        const urlParams: Record<string, any> = {};
        for (const key in args) {
          const placeholder = `{${key}}`;
          if (processedUrl.includes(placeholder)) {
            processedUrl = processedUrl.replace(placeholder, encodeURIComponent(String(args[key])));
          } else {
             // Parâmetros não usados na URL são potenciais query/body params
            urlParams[key] = args[key];
          }
        }
        console.log(`[Tool:${toolData.name}] URL processada: ${processedUrl}`);

        const requestConfig: AxiosRequestConfig = {
          method: method,
          url: processedUrl,
          headers: headers,
        };

        // Adiciona parâmetros de query ou corpo da requisição
        if (method === HttpMethod.GET || method === HttpMethod.DELETE) {
           // Usar os argumentos que não foram substituídos na URL como query params
           if(Object.keys(urlParams).length > 0) {
               requestConfig.params = urlParams; 
               console.log(`[Tool:${toolData.name}] Adicionando Query Params:`, urlParams);
           }
        } else if (method === HttpMethod.POST || method === HttpMethod.PUT || method === HttpMethod.PATCH) {
           // Usar os argumentos que não foram substituídos na URL como corpo
           // (Assumindo que a ferramenta espera todos os args no corpo se não estiverem na URL)
           requestConfig.data = urlParams; 
           console.log(`[Tool:${toolData.name}] Adicionando Request Body:`, urlParams);
           // Definir Content-Type se não estiver nos headers customizados
           if (!headers['Content-Type'] && !headers['content-type']) {
               requestConfig.headers['Content-Type'] = 'application/json';
               console.log(`[Tool:${toolData.name}] Definindo Content-Type para application/json`);
           }
        }
        
        console.log(`[Tool:${toolData.name}] Realizando requisição:`, {
          method: requestConfig.method,
          url: requestConfig.url,
          headers: requestConfig.headers,
          params: requestConfig.params,
          data: requestConfig.data,
        });
        const response = await axios(requestConfig);

        console.log(`[Tool:${toolData.name}] Resposta recebida (Status: ${response.status})`);
        // TODO: Usar responseSchema para validar/formatar a resposta?
        return { success: true, data: response.data };
        
      } catch (error: any) {
        console.error(`[Tool:${toolData.name}] Erro na execução:`, error);
        const errorMessage = axios.isAxiosError(error) 
          ? `Request failed with status ${error.response?.status}: ${JSON.stringify(error.response?.data)}`
          : error.message || 'Unknown HTTP request error';
        // Retorna falha e a mensagem de erro
        return { success: false, error: errorMessage };
      }
    },
  };
}

/**
 * Carrega as ferramentas de IA disponíveis para um determinado workspace.
 * Inclui ferramentas built-in, condicionais (Google Calendar) e customizadas (HTTP).
 * 
 * @param workspaceId O ID do workspace.
 * @returns Um Record contendo as ferramentas ativas para o Vercel AI SDK.
 */
export async function getActiveToolsForWorkspace(workspaceId: string): Promise<Record<string, Tool<any, any>>> {
  console.log(`[toolLoader] Carregando ferramentas para workspace: ${workspaceId}`);
  const activeTools: Record<string, Tool<any, any>> = {};

  // 1. Ferramentas Built-in (sempre ativas?)
  activeTools.humanTransfer = humanTransferTool; // Adiciona a ferramenta de transferência humana

  // 2. Ferramentas Condicionais (Google Calendar)
  const googleConnected = await hasGoogleConnection(workspaceId);
  if (googleConnected) {
    console.log(`[toolLoader] Conexão Google ativa para workspace ${workspaceId}. Adicionando ferramentas de calendário.`);
    setCurrentWorkspaceId(workspaceId);
    activeTools.checkCalendarAvailability = checkCalendarAvailabilityTool;
    activeTools.scheduleCalendarEvent = scheduleCalendarEventTool;
  } else {
    console.log(`[toolLoader] Conexão Google inativa para workspace ${workspaceId}. Ferramentas de calendário não adicionadas.`);
  }

  // 3. Ferramentas Customizadas (HTTP)
  try {
    console.log(`[toolLoader] Buscando ferramentas HTTP customizadas para workspace ${workspaceId}...`);
    const customHttpTools = await prisma.customHttpTool.findMany({
      where: {
        workspaceId: workspaceId,
        isEnabled: true, // Apenas ferramentas ativas
      },
    });
    console.log(`[toolLoader] Encontradas ${customHttpTools.length} ferramentas HTTP customizadas ativas.`);
    console.log(`[toolLoader] Detalhes das ferramentas HTTP customizadas:`, JSON.stringify(customHttpTools.map(t => ({ name: t.name, isEnabled: t.isEnabled })), null, 2));
 
     // Gerar e adicionar ferramentas dinâmicas
     for (const toolData of customHttpTools) {
       if (activeTools[toolData.name]) {
          console.warn(`[toolLoader] Conflito de nome de ferramenta: "${toolData.name}" já existe. Pulando ferramenta customizada com ID ${toolData.id}.`);
          continue;
       }
       try {
         const dynamicTool = createDynamicHttpTool(toolData);
         activeTools[toolData.name] = dynamicTool;
         console.log(`[toolLoader] Ferramenta dinâmica "${toolData.name}" adicionada.`);
       } catch (toolCreationError: any) {
           console.error(`[toolLoader] Erro ao criar ferramenta dinâmica para "${toolData.name}" (ID: ${toolData.id}):`, toolCreationError);
       }
     }

  } catch (error) {
    console.error(`[toolLoader] Erro ao buscar ou processar ferramentas HTTP customizadas para workspace ${workspaceId}:`, error);
    // Continuar mesmo se houver erro ao carregar ferramentas customizadas?
  }

  console.log(`[toolLoader] Ferramentas ativas carregadas para workspace ${workspaceId}:`, Object.keys(activeTools));
  return activeTools;
}

// TODO: Implementar loadCustomHttpTools(workspaceId) que busca no DB e gera os tools. 