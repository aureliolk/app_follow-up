'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation'; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HttpMethod, CustomHttpTool } from '@prisma/client';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

// <<< Importar Server Actions >>>
import { createCustomHttpTool, updateCustomHttpTool } from '@/lib/actions/toolActions';
// <<< Importar Tipos >>>
import type { ToolInputData, ToolUpdateData } from '@/lib/actions/toolActions';

interface ToolFormProps {
    workspaceId: string;
    initialData?: CustomHttpTool | null;
}

export default function ToolForm({ workspaceId, initialData }: ToolFormProps) {
    const router = useRouter();
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [method, setMethod] = useState<HttpMethod>(initialData?.method || HttpMethod.GET);
    const [url, setUrl] = useState(initialData?.url || '');
    // Guardar como string para o Textarea, parsear no submit
    const [headersStr, setHeadersStr] = useState(initialData?.headers ? JSON.stringify(initialData.headers, null, 2) : '');
    const [querySchemaStr, setQuerySchemaStr] = useState(initialData?.queryParametersSchema ? JSON.stringify(initialData.queryParametersSchema, null, 2) : '');
    const [bodySchemaStr, setBodySchemaStr] = useState(initialData?.requestBodySchema ? JSON.stringify(initialData.requestBodySchema, null, 2) : '');
    const [isEnabled, setIsEnabled] = useState(initialData?.isEnabled ?? true);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEditing = !!initialData;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        let parsedHeaders = null;
        let parsedQuerySchema = null;
        let parsedBodySchema = null;

        // Validar e parsear JSONs
        try {
            if (headersStr.trim()) parsedHeaders = JSON.parse(headersStr);
            if (querySchemaStr.trim()) parsedQuerySchema = JSON.parse(querySchemaStr);
            if (bodySchemaStr.trim()) parsedBodySchema = JSON.parse(bodySchemaStr);
        } catch (jsonError: any) {
            setError(`Erro ao processar JSON: ${jsonError.message}. Verifique os campos de Headers e Schemas.`);
            toast.error("Erro no formato JSON inserido.");
            setIsLoading(false);
            return;
        }

        // Montar dados base
        const baseData = {
            name,
            description,
            method,
            url,
            headers: parsedHeaders,
            queryParametersSchema: parsedQuerySchema,
            requestBodySchema: parsedBodySchema,
            isEnabled,
        };

        // <<< Chamar Server Actions >>>
        try {
            if (isEditing && initialData) {
                 // Dados para Update (sem workspaceId)
                const updateData: ToolUpdateData = baseData;
                await updateCustomHttpTool(initialData.id, updateData);
                toast.success('Ferramenta atualizada com sucesso!');
            } else {
                 // Dados para Create (com workspaceId)
                const createData: ToolInputData = { ...baseData, workspaceId };
                await createCustomHttpTool(createData);
                toast.success('Ferramenta criada com sucesso!');
            }
            // Redirecionar de volta para a lista de ferramentas após sucesso
            router.push(`/workspace/${workspaceId}/ia/tools`);
            router.refresh(); // Atualizar dados na página de lista
        } catch (actionError: any) {
            console.error("Error saving tool:", actionError);
            const errorMessage = actionError.message || 'Ocorreu um erro desconhecido ao salvar a ferramenta.';
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <form onSubmit={handleSubmit}>
                <CardHeader>
                    <CardTitle>{isEditing ? 'Editar Ferramenta' : 'Nova Ferramenta'}</CardTitle>
                    <CardDescription>
                        Configure os detalhes da ferramenta HTTP que a IA poderá utilizar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Coluna 1 */}
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="name">Nome da Ferramenta *</Label>
                                <Input 
                                    id="name" 
                                    value={name} 
                                    onChange={(e) => setName(e.target.value)} 
                                    placeholder="Ex: buscar_pedido_por_id" 
                                    required 
                                />
                                <p className="text-xs text-muted-foreground mt-1">Nome curto usado pela IA para chamar a ferramenta.</p>
                            </div>
                            <div>
                                <Label htmlFor="description">Descrição *</Label>
                                <Textarea 
                                    id="description" 
                                    value={description} 
                                    onChange={(e) => setDescription(e.target.value)} 
                                    placeholder="Descreva claramente o que a ferramenta faz, quando usá-la e quais parâmetros esperar."
                                    required
                                    rows={4}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Instruções detalhadas para a IA.</p>
                            </div>
                             <div>
                                <Label htmlFor="method">Método HTTP *</Label>
                                <Select value={method} onValueChange={(value) => setMethod(value as HttpMethod)} required>
                                    <SelectTrigger id="method">
                                        <SelectValue placeholder="Selecione o método" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.values(HttpMethod).map((m) => (
                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="url">URL do Endpoint *</Label>
                                <Input 
                                    id="url" 
                                    type="url"
                                    value={url} 
                                    onChange={(e) => setUrl(e.target.value)} 
                                    placeholder="https://api.example.com/orders/{orderId}" 
                                    required 
                                />
                                <p className="text-xs text-muted-foreground mt-1">URL completa. Use {`{placeholder}`} para partes variáveis que virão dos parâmetros.</p>
                            </div>
                            <div className="flex items-center space-x-2 pt-2">
                                <Switch 
                                    id="isEnabled" 
                                    checked={isEnabled}
                                    onCheckedChange={setIsEnabled}
                                />
                                <Label htmlFor="isEnabled">Ferramenta Habilitada</Label>
                            </div>
                        </div>

                        {/* Coluna 2 */}
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="headers">Cabeçalhos (JSON)</Label>
                                <Textarea 
                                    id="headers" 
                                    value={headersStr} 
                                    onChange={(e) => setHeadersStr(e.target.value)} 
                                    placeholder={'{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer {{SECRET_API_KEY}}"\n}'}
                                    rows={4}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Formato JSON. Use {`{{PLACEHOLDER}}`} para segredos.</p>
                            </div>
                           <div>
                                <Label htmlFor="querySchema">Schema Parâmetros de Query (JSON Schema)</Label>
                                <Textarea 
                                    id="querySchema" 
                                    value={querySchemaStr} 
                                    onChange={(e) => setQuerySchemaStr(e.target.value)} 
                                    placeholder='{\n  "type": "object",\n  "properties": {\n    "userId": { "type": "string", "description": "ID do usuário" }\n  },\n  "required": ["userId"]\n}'
                                    rows={6}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Define os parâmetros esperados na URL para métodos GET/DELETE.</p>
                            </div>
                            <div>
                                <Label htmlFor="bodySchema">Schema Corpo da Requisição (JSON Schema)</Label>
                                <Textarea 
                                    id="bodySchema" 
                                    value={bodySchemaStr} 
                                    onChange={(e) => setBodySchemaStr(e.target.value)} 
                                    placeholder='{\n  "type": "object",\n  "properties": {\n    "productName": { "type": "string" },\n    "quantity": { "type": "integer" }\n  },\n  "required": ["productName", "quantity"]\n}'
                                    rows={6}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Define a estrutura do corpo JSON para métodos POST/PUT/PATCH.</p>
                            </div>
                        </div>
                    </div>
                    
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button type="submit" className="ml-4" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isEditing ? 'Salvar Alterações' : 'Criar Ferramenta'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
} 