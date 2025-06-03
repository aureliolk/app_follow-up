'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { createAIStage, updateAIStage } from '@/lib/actions/aiStageActions';
import { toast } from 'react-hot-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ApiActionForm from './ApiActionForm';
import MediaActionForm from './MediaActionForm'; // Import the new component
import { AIStageActionTypeEnum } from '@/lib/types/ai-stages';
import { useRouter } from 'next/navigation';

// Define the AIStage type locally, using `any` for JsonValue
interface AIStage {
    id: string;
    workspaceId: string;
    name: string;
    condition: string;
    isActive: boolean;
    // Use `any` for dataToCollect to resolve linter error with JsonValue import
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

interface StageFormProps {
    workspaceId: string;
    initialData?: AIStage; // Make initialData optional and type it
    onSuccess?: () => void; // Make onSuccess optional
}

export default function StageForm({ workspaceId, initialData, onSuccess }: StageFormProps) {
    const router = useRouter();
    // Initialize state directly from initialData
    const [name, setName] = useState(initialData?.name || '');
    const [condition, setCondition] = useState(initialData?.condition || '');
    const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
    const initialDataToCollectValue = Array.isArray(initialData?.dataToCollect) 
        ? (initialData.dataToCollect as string[]).join(', ') 
        : '';
    const [dataToCollect, setDataToCollect] = useState(initialDataToCollectValue);
    const [finalResponseInstruction, setFinalResponseInstruction] = useState(initialData?.finalResponseInstruction || '');
    
    // State for managing actions
    const [actions, setActions] = useState<AIStageAction[]>(initialData?.actions || []);
    const [newActionType, setNewActionType] = useState<AIStageActionTypeEnum | ''>(''); // Remove hardcoded types

    const [isPending, startTransition] = useTransition();

    // Effect to reset form when initialData changes significantly (e.g., changing stage ID)
    // Using initialData?.id as dependency to avoid unnecessary resets on every render
    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setCondition(initialData.condition);
            setIsActive(initialData.isActive); // Ensure isActive is set from initialData
            const initialDataToCollectValue = Array.isArray(initialData.dataToCollect) 
                ? (initialData.dataToCollect as string[]).join(', ') 
                : '';
            setDataToCollect(initialDataToCollectValue);
            setFinalResponseInstruction(initialData.finalResponseInstruction || '');
            // Deep copy actions to ensure a new array reference is created if initialData.actions changes
            // This is important because setActions expects a new array reference to trigger updates
            setActions(JSON.parse(JSON.stringify(initialData.actions || []))); // Deep copy using JSON parse/stringify
        } else {
            // Reset for new stage
            setName('');
            setCondition('');
            setIsActive(true);
            setDataToCollect('');
            setFinalResponseInstruction('');
            setActions([]); // Reset actions for new stage
        }
    }, [initialData?.id]); // Dependency on initialData.id to trigger reset only when stage changes
    // Add other primitive dependencies if needed: [initialData?.id, initialData?.name, initialData?.condition, initialData?.isActive, initialData?.finalResponseInstruction]
    // But depending on initialData?.id is usually sufficient for a form reset when navigating between items.

    // Function to add a new action based on selected type
    const handleAddAction = () => {
        if (!newActionType) {
            toast.error('Selecione um tipo de ação para adicionar.');
            return;
        }
        // Create a basic structure for the new action
        const newAction: AIStageAction = {
             // No ID yet, it will be assigned by the backend on save
            type: newActionType as AIStageActionTypeEnum, // Cast to AIStageActionTypeEnum for type compatibility where needed
            order: actions.length + 1, // Simple ordering for now
            config: {}, // Empty config, will be filled in specific action forms
            isEnabled: true,
        };
        // Ensure we create a new array reference when adding
        setActions([...actions, newAction]);
        setNewActionType(''); // Reset selector
    };

    // Function to remove an action
    const handleRemoveAction = (index: number) => {
        // Ensure we create a new array reference when removing
        const updatedActions = actions.filter((_, i) => i !== index);
        setActions(updatedActions);
         // TODO: Re-order actions after removal if necessary
    };

    // Function to update an action's config or isEnabled status
     const handleUpdateActionConfig = (index: number, newConfig: any) => {
        // Ensure we create a new array reference when updating
        const updatedActions = actions.map((action, i) => 
             i === index ? { ...action, config: newConfig } : action
        );
        setActions(updatedActions);
    };

     const handleUpdateActionEnabled = (index: number, isEnabled: boolean) => {
         // Ensure we create a new array reference when updating
         const updatedActions = actions.map((action, i) => 
             i === index ? { ...action, isEnabled: isEnabled } : action
         );
         setActions(updatedActions);
     };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !condition) {
            toast.error('Nome e Condição são campos obrigatórios.');
            return;
        }

        const stageData = {
            name,
            condition,
            isActive,
            dataToCollect: dataToCollect ? dataToCollect.split(',').map(item => item.trim()).filter(item => item !== '') as string[] : [],
            finalResponseInstruction: finalResponseInstruction || undefined,
            actions: actions, // Include actions in the data to save
        };

        startTransition(async () => {
            let result;
            if (initialData?.id) {
                result = await updateAIStage(initialData.id, stageData);
                 if (result.success) {
                    toast.success('Estágio atualizado com sucesso!');
                    router.push(`/workspace/${workspaceId}/ia/stages`);
                } else {
                    toast.error(`Erro ao atualizar estágio: ${result.message}`);
                }
            } else {
                result = await createAIStage(workspaceId, stageData);
                 if (result.success) {
                    toast.success('Estágio criado com sucesso!');
                    onSuccess?.();
                } else {
                    toast.error(`Erro ao criar estágio: ${result.message}`);
                }
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <Label htmlFor="name">Nome do Estágio</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/\s/g, '_'))}
                    required
                />
            </div>

            <div>
                <Label htmlFor="condition">Condição Geral para Ativação</Label>
                <Textarea
                    id="condition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    required
                    rows={4}
                />
            </div>

            <div className="flex items-center space-x-2">
                <Checkbox
                    id="isActive"
                    checked={isActive}
                    onCheckedChange={(checked) => setIsActive(Boolean(checked))}
                />
                <Label htmlFor="isActive">Estágio Ativo</Label>
            </div>

            <div>
                <Label htmlFor="dataToCollect">Dados a Coletar (separados por vírgula)</Label>
                <Input
                    id="dataToCollect"
                    value={dataToCollect}
                    onChange={(e) => setDataToCollect(e.target.value)}
                    placeholder="Ex: nome_cliente, email"
                />
            </div>

            <div>
                <Label htmlFor="finalResponseInstruction">Instrução Final para Responder o Usuário</Label>
                <Textarea
                    id="finalResponseInstruction"
                    value={finalResponseInstruction}
                    onChange={(e) => setFinalResponseInstruction(e.target.value)}
                    rows={4}
                    placeholder="Ex: Certo, {{nome_cliente}}. Seu pedido..."
                />
            </div>

            <div className="border-t pt-6 mt-6">
                <h2 className="text-2xl font-bold mb-4">Ações</h2>

                <div className="space-y-4 mb-6">
                    {actions.map((action, index) => (
                         <div key={action.id || index} className="border rounded-md p-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-semibold">Ação #{index + 1}: {action.type.replace('_', ' ')}</h3>
                                 <Button variant="outline" size="sm" onClick={() => handleRemoveAction(index)}>
                                    Remover
                                </Button>
                            </div>
                             {/* Render specific form for action.type */}
                             {action.type === AIStageActionTypeEnum.API_CALL && (
                                 <ApiActionForm 
                                     workspaceId={workspaceId}
                                     config={action.config} 
                                     onUpdate={(newConfig) => handleUpdateActionConfig(index, newConfig)}
                                 />
                             )}
                            {/* Render specific form for media action types */}
                            {(action.type === AIStageActionTypeEnum.SEND_TEXT_MESSAGE ||
                              action.type === AIStageActionTypeEnum.SEND_VIDEO ||
                              action.type === AIStageActionTypeEnum.SEND_IMAGE ||
                              action.type === AIStageActionTypeEnum.SEND_DOCUMENT) && (
                                <MediaActionForm
                                    actionType={action.type}
                                    config={action.config}
                                    onUpdate={(newConfig) => handleUpdateActionConfig(index, newConfig)}
                                />
                            )}
                         </div>
                    ))}
                </div>

                <div className="flex space-x-2 items-center">
                    <Select onValueChange={(value: AIStageActionTypeEnum) => setNewActionType(value)} value={newActionType}>
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="Selecionar tipo de ação" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={AIStageActionTypeEnum.API_CALL}>Chamar uma API</SelectItem>
                            <SelectItem value={AIStageActionTypeEnum.SEND_TEXT_MESSAGE}>Enviar Mensagem de Texto</SelectItem>
                            <SelectItem value={AIStageActionTypeEnum.SEND_VIDEO}>Enviar Vídeo</SelectItem>
                            <SelectItem value={AIStageActionTypeEnum.SEND_IMAGE}>Enviar Imagem</SelectItem>
                            <SelectItem value={AIStageActionTypeEnum.SEND_DOCUMENT}>Enviar Documento</SelectItem>
                            <SelectItem value={AIStageActionTypeEnum.CONNECT_CALENDAR} disabled>Conectar Calendário (em breve)</SelectItem>
                            <SelectItem value={AIStageActionTypeEnum.TRANSFER_HUMAN} disabled>Transferir para Humano (em breve)</SelectItem>
                        </SelectContent>
                    </Select>
                     <Button onClick={handleAddAction} disabled={!newActionType || isPending}>
                         + Adicionar Ação
                     </Button>
                </div>
            </div>

            <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando...' : initialData ? 'Atualizar Estágio' : 'Criar Estágio'}
            </Button>
        </form>
    );
}
