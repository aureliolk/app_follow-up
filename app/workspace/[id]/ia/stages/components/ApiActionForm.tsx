'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import isEqual from 'lodash.isequal';

// Define a helper function for safe JSON parsing
const safeJsonParse = (jsonString: string | undefined, fieldName?: string) => {
    if (!jsonString) return undefined;
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error(`Failed to parse JSON string for ${fieldName || 'a field'}:`, jsonString, error);
        toast.error(`Formato JSON inválido no campo '${fieldName || 'desconhecido'}'.`);
        return undefined; // Return undefined or null on parsing error
    }
};

// Import the testApiCall Server Action and its exported config type
import { testApiCall } from '@/lib/actions/aiStageActions';
// Import types from the new types file
import { ApiCallConfig, AIStageActionTypeEnum } from '@/lib/types/ai-stages';

interface ApiActionFormProps {
    config: ApiCallConfig; // Current configuration of the API call action
    onUpdate: (newConfig: ApiCallConfig) => void; // Callback to update the parent state
    workspaceId: string; // Pass workspaceId for the test call
}

export default function ApiActionForm({ config, onUpdate, workspaceId }: ApiActionFormProps) {
    const [apiName, setApiName] = useState(config.apiName || '');
    const [url, setUrl] = useState(config.url || '');
    const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "DELETE" | "PATCH">(config.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" || 'GET');
    const [headers, setHeaders] = useState(JSON.stringify(config.headers, null, 2) || '');
    const [querySchema, setQuerySchema] = useState(JSON.stringify(config.querySchema, null, 2) || '');
    const [bodySchema, setBodySchema] = useState(JSON.stringify(config.bodySchema, null, 2) || '');
    const [responseMapping, setResponseMapping] = useState(JSON.stringify(config.responseMapping, null, 2) || '');
    const [useApiResponse, setUseApiResponse] = useState(config.useApiResponse ?? true); // Default to true

    // State for test request result and loading
    const [testResult, setTestResult] = useState<any>(null);
    const [isTesting, startTestTransition] = useTransition();

    // State for the body content to be sent during the test request
    const [testRequestBody, setTestRequestBody] = useState('');

    // Ref to store the last reported config
    const lastReportedConfig = useRef<ApiCallConfig | null>(null);

    // Use effect to update the parent component whenever internal state changes
    useEffect(() => {
        // Use the safeJsonParse helper to handle potential errors
        const parsedHeaders = safeJsonParse(headers, 'Headers');
        const parsedQuerySchema = safeJsonParse(querySchema, 'Schema da Query');
        const parsedBodySchema = safeJsonParse(bodySchema, 'Schema do Body');
        const parsedResponseMapping = safeJsonParse(responseMapping, 'Mapeamento da Resposta');

        const currentConfig: ApiCallConfig = {
            apiName,
            url,
            method,
            headers: parsedHeaders,
            querySchema: parsedQuerySchema,
            bodySchema: parsedBodySchema,
            responseMapping: parsedResponseMapping,
            useApiResponse,
        };

        // Perform a deep comparison before calling onUpdate
        if (!isEqual(currentConfig, lastReportedConfig.current)) {
            onUpdate(currentConfig);
            lastReportedConfig.current = currentConfig; // Update ref with the new reported config
        }
    }, [apiName, url, method, headers, querySchema, bodySchema, responseMapping, useApiResponse, onUpdate]);

     // Handle test request button click
    const handleTestRequest = () => {
        // Basic validation before testing
        if (!url) {
            toast.error('A URL do Endpoint é obrigatória para testar.');
            return;
        }

        // Prepare config for the test call (matching backend type)
        const testConfig: ApiCallConfig = {
             apiName, // Include apiName even if not used by backend test action for consistency
             url,
             method,
             // Use safeJsonParse for headers, default to empty object. Ensure Content-Type is application/json if body is present.
             headers: {
                 'Content-Type': (method === 'POST' || method === 'PUT' || method === 'PATCH') && testRequestBody ? 'application/json' : undefined,
                 ...(safeJsonParse(headers) || {}),
             },
             // Schemas and mapping are not sent for a basic test call
             querySchema: undefined, // Ensure these are undefined as they are not needed for the test itself
             bodySchema: undefined,
             // Include the test request body if the method supports it
             ...(method === 'POST' || method === 'PUT' || method === 'PATCH' ? { body: safeJsonParse(testRequestBody, 'Corpo da Requisição para Teste') } : {}),
             responseMapping: undefined,
             useApiResponse: undefined,
         };

        startTestTransition(async () => {
            const result = await testApiCall(workspaceId, testConfig);
            setTestResult(result); // Store the result
        });
    };

    return (
        <div className="space-y-4">
            {/* Existing fields */}
            <div>
                <Label htmlFor="apiName">Nome da API</Label>
                <Input id="apiName" value={apiName} onChange={(e) => setApiName(e.target.value)} />
            </div>
            <div>
                <Label htmlFor="url">URL do Endpoint</Label>
                <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} required type="url"/>
            </div>
            <div>
                <Label htmlFor="method">Método HTTP</Label>
                 <Select onValueChange={(value) => setMethod(value as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')} value={method}>
                     <SelectTrigger>
                         <SelectValue placeholder="Selecionar Método" />
                     </SelectTrigger>
                     <SelectContent>
                         <SelectItem value="GET">GET</SelectItem>
                         <SelectItem value="POST">POST</SelectItem>
                         <SelectItem value="PUT">PUT</SelectItem>
                         <SelectItem value="DELETE">DELETE</SelectItem>
                         <SelectItem value="PATCH">PATCH</SelectItem>
                         {/* Add other methods if needed */}
                     </SelectContent>
                 </Select>
            </div>
            <div>
                <Label htmlFor="headers">Headers (JSON)</Label>
                <Textarea id="headers" value={headers} onChange={(e) => setHeaders(e.target.value)} rows={3} placeholder='{ "Content-Type": "application/json" }' />
            </div>
            <div>
                <Label htmlFor="querySchema">Schema da Query (JSON Schema)</Label>
                <Textarea id="querySchema" value={querySchema} onChange={(e) => setQuerySchema(e.target.value)} rows={4} placeholder='{ "type": "object", "properties": { "param": { "type": "string" } } }' />
            </div>
            <div>
                <Label htmlFor="bodySchema">Schema do Body (JSON Schema)</Label>
                <Textarea id="bodySchema" value={bodySchema} onChange={(e) => setBodySchema(e.target.value)} rows={4} placeholder='{ "type": "object", "properties": { "field": { "type": "string" } } }' />
            </div>
             <div>
                <Label htmlFor="responseMapping">Mapeamento da Resposta (JSON)</Label>
                <Textarea id="responseMapping" value={responseMapping} onChange={(e) => setResponseMapping(e.target.value)} rows={4} placeholder='{ "variable_name": "response.data.path" }' />
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox
                    id="useApiResponse"
                    checked={useApiResponse}
                    onCheckedChange={(checked) => setUseApiResponse(Boolean(checked))}
                />
                <Label htmlFor="useApiResponse">Utilizar dados da resposta da API para preencher variáveis</Label>
            </div>

            {/* Test Request Section */}
             <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-2">Testar Requisição</h3>

                 {/* Input for Test Request Body (appears for methods that support body) */}
                 {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
                     <div className="mb-4">
                         <Label htmlFor="testRequestBody">Corpo da Requisição para Teste (JSON)</Label>
                         <Textarea
                             id="testRequestBody"
                             value={testRequestBody}
                             onChange={(e) => setTestRequestBody(e.target.value)}
                             rows={6}
                             placeholder='{ "chave": "valor" }'
                         />
                     </div>
                 )}

                  <Button onClick={handleTestRequest} disabled={isTesting || !url}>
                      {isTesting ? 'Testando...' : 'Testar Requisição'}
                  </Button>

                  {testResult && (
                     <div className="mt-4">
                         <Label htmlFor="testResult">Resultado do Teste</Label>
                         <Textarea
                             id="testResult"
                             value={JSON.stringify(testResult, null, 2)}
                             rows={10}
                             readOnly
                             className={testResult.success ? "border-green-500" : "border-red-500"}
                         />
                     </div>
                 )}
             </div>

        </div>
    );
}
