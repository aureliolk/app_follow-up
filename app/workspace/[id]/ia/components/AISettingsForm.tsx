// app/workspace/[id]/ia/components/AISettingsForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { updateAiSettingsAction } from '@/lib/actions/workspaceSettingsActions';

// Lista atualizada de modelos disponíveis
const AVAILABLE_MODELS = [
    // Modelos via OpenRouter
    // Modelos OpenAI
    { value: 'openrouter/openai/gpt-4o-mini', label: 'OpenAI: GPT-4o Mini' },

    // Modelos Google
    { value: 'openrouter/google/gemini-2.5-pro-exp-03-25:free', label: 'Google: Gemini 2.5 Pro (Free)' },
    { value: 'openrouter/google/gemini-2.5-pro-preview-03-25', label: 'Google: Gemini 2.5 Pro Preview' },
    { value: 'openrouter/google/gemini-2.0-flash-001', label: 'Google: Gemini 2.0 Flash' },

    // Modelos XAI
    { value: 'openrouter/x-ai/grok-3-beta', label: 'XAI: Grok-3 Beta' }, 
    { value: 'openrouter/x-ai/grok-3-mini-beta', label: 'XAI: Grok-3 Mini Beta' }, 

    // Modelos DeepSeek
    { value: 'openrouter/deepseek/deepseek-chat-v3-0324', label: 'DeepSeek: DeepSeek Chat v3' },
];

export default function AISettingsForm() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();

  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [aiName, setAiName] = useState('');
  const [aiDelayBetweenMessages, setAiDelayBetweenMessages] = useState<number>(3000);
  const [aiSendFractionated, setAiSendFractionated] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Estado para gerenciar o resultado da Server Action
  const [state, formAction] = useActionState(
    async (prevState: any, formData: FormData) => {
        if (!workspace?.id) {
            return { success: false, error: 'ID do workspace não encontrado.' };
        }

        // Construir o objeto de dados para a action
        const data = {
            workspaceId: workspace.id,
            ai_default_system_prompt: formData.get('ai_default_system_prompt') as string | null,
            ai_model_preference: formData.get('ai_model_preference') as string | null,
            ai_name: formData.get('ai_name') as string | null,
            ai_delay_between_messages: formData.get('ai_delay_between_messages') 
                ? parseInt(formData.get('ai_delay_between_messages') as string, 10) 
                : null,
            // Checkbox fix: se não existe no FormData, significa que está desmarcado
            ai_send_fractionated: formData.has('ai_send_fractionated'),
        };

        console.log("[AISettingsForm Action] Data to be sent:", data);
        console.log("[AISettingsForm Action] FormData contents:");
        for (const [key, value] of formData.entries()) {
            console.log(`  ${key}: ${value}`);
        }
        console.log("[AISettingsForm Action] FormData has ai_send_fractionated:", formData.has('ai_send_fractionated'));
        
        try {
            const result = await updateAiSettingsAction(data);
            
            // Se sucesso, incluir os dados atualizados no resultado
            if (result.success && result.data) {
                return {
                    ...result,
                    updatedData: result.data
                };
            }
            
            return result;
        } catch (error: any) {
            console.error("[AISettingsForm Action] Error:", error);
            return { success: false, error: error.message || 'Erro desconhecido' };
        }
    },
    null // Estado inicial
  );

  // Efeito para mostrar toasts com base no resultado da Server Action
  useEffect(() => {
    if (state) {
        if (state.success) {
            toast.success('Configurações de IA salvas com sucesso!');
            
            // Atualizar os campos locais com os dados salvos para sincronizar
            if (state.updatedData) {
                const updatedData = state.updatedData;
                console.log("[AISettingsForm Effect] Updating local state with saved data:", updatedData);
                
                // IMPORTANTE: Atualizar apenas os campos que foram salvos e existem na resposta
                if ('ai_default_system_prompt' in updatedData) {
                    setSystemPrompt(updatedData.ai_default_system_prompt || '');
                    console.log("[AISettingsForm Effect] Updated systemPrompt:", updatedData.ai_default_system_prompt);
                }
                
                if ('ai_model_preference' in updatedData) {
                    const newModel = updatedData.ai_model_preference || AVAILABLE_MODELS[0].value;
                    console.log("[AISettingsForm Effect] Current modelPreference:", modelPreference);
                    console.log("[AISettingsForm Effect] New modelPreference from server:", newModel);
                    setModelPreference(newModel);
                }
                
                if ('ai_name' in updatedData) {
                    setAiName(updatedData.ai_name || 'Beatriz');
                    console.log("[AISettingsForm Effect] Updated aiName:", updatedData.ai_name);
                }
                
                if ('ai_delay_between_messages' in updatedData) {
                    setAiDelayBetweenMessages(Number(updatedData.ai_delay_between_messages) || 3000);
                    console.log("[AISettingsForm Effect] Updated aiDelayBetweenMessages:", updatedData.ai_delay_between_messages);
                }
                
                if ('ai_send_fractionated' in updatedData) {
                    const newFractionated = updatedData.ai_send_fractionated || false;
                    console.log("[AISettingsForm Effect] Current aiSendFractionated:", aiSendFractionated);
                    console.log("[AISettingsForm Effect] New aiSendFractionated from server:", newFractionated);
                    setAiSendFractionated(newFractionated);
                }
            }
        } else if (state.error) {
            toast.error(`Erro ao salvar: ${state.error}`);
        }
    }
  }, [state]);

  // Efeito para inicializar o estado com dados do workspace
  useEffect(() => {
    if (workspace && !initialized) {
      console.log("[AISettingsForm Effect] Setting state from workspace", workspace);

      setSystemPrompt(workspace.ai_default_system_prompt || '');
      setModelPreference(workspace.ai_model_preference || AVAILABLE_MODELS[0].value);
      setAiName(workspace.ai_name || 'Beatriz');
      setAiDelayBetweenMessages(
        workspace.ai_delay_between_messages === null || workspace.ai_delay_between_messages === undefined
          ? 3000
          : Number(workspace.ai_delay_between_messages)
      );
      setAiSendFractionated(workspace.ai_send_fractionated || false);
      setInitialized(true);
    }
  }, [workspace, initialized]);

  // Renderizar loading se necessário
  if (workspaceLoading || !workspace || !initialized) {
    return <p className="text-muted-foreground">Carregando configurações de IA...</p>;
  }

  return (
    <Card className="border-border bg-card w-full rounded-xl shadow-md">
      <CardHeader>
        <CardTitle className="text-card-foreground">Configurações da Inteligência Artificial</CardTitle>
        <CardDescription>
          Personalize o comportamento da IA para este workspace. Defina a persona, o contexto e os objetivos.
        </CardDescription>
      </CardHeader>
      
      <form action={formAction}>
        <CardContent className="space-y-6">
          {/* Primeira linha: Nome da IA e Delay */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full">
              <Label htmlFor="ai_name" className="text-foreground">
                Nome da IA
              </Label>
              <Input
                id="ai_name"
                name="ai_name"
                value={aiName}
                onChange={(e) => setAiName(e.target.value)}
                placeholder="Ex: Beatriz, Atendente Virtual"
                className="bg-input border-input w-full"
                disabled={workspaceLoading}
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este nome será usado para assinar as mensagens enviadas pela IA.
              </p>
            </div>
            
            <div className="w-full md:w-1/2">
              <Label htmlFor="ai_delay_between_messages" className="text-foreground">
                Tempo de debounce entre jobs (ms)
              </Label>
              <Input
                type="number"
                id="ai_delay_between_messages"
                name="ai_delay_between_messages"
                value={aiDelayBetweenMessages}
                onChange={(e) => setAiDelayBetweenMessages(parseInt(e.target.value, 10) || 0)}
                placeholder="Ex: 10000"
                className="bg-input border-input w-full"
                disabled={workspaceLoading}
                min="0"
                step="100"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tempo de espera para agrupar mensagens sequenciais. Ex: 10000 para 10 segundos.
              </p>
            </div>
          </div>

          {/* Modelo de IA */}
          <div className="space-y-1.5">
            <Label htmlFor="ai_model_preference" className="text-foreground">
              Modelo de IA Preferido
            </Label>
            <Select
                name="ai_model_preference"
                value={modelPreference}
                onValueChange={(value) => setModelPreference(value)}
                disabled={workspaceLoading}
            >
              <SelectTrigger className="w-full md:w-1/2 bg-input border-input">
                <SelectValue placeholder="Selecione um modelo..." />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map(model => (
                    <SelectItem key={model.value} value={model.value}>
                        {model.label}
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
                Escolha o modelo de linguagem que a IA usará para gerar respostas.
            </p>
          </div>

          {/* Prompt do Sistema */}
          <div className="space-y-1.5">
            <Label htmlFor="ai_default_system_prompt" className="text-foreground">
              Prompt Principal do Sistema (Contexto da IA)
            </Label>
            <Textarea
              id="ai_default_system_prompt"
              name="ai_default_system_prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Descreva aqui a persona da IA, o produto/serviço, objetivos da conversa, tom de voz, informações importantes, etc."
              className="bg-input border-input min-h-[250px] font-mono text-sm"
              disabled={workspaceLoading}
            />
            <div className="text-xs text-muted-foreground flex items-start gap-1 pt-1">
              <Info className="h-3 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Este prompt define o comportamento base da IA. Quanto mais detalhado, melhor.
                Inclua informações sobre o negócio, o que a IA deve ou não fazer, e o objetivo final da interação.
              </span>
            </div>
          </div>

          {/* Checkbox para envio fracionado */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="ai_send_fractionated"
                name="ai_send_fractionated"
                checked={aiSendFractionated}
                onCheckedChange={(checked) => {
                  console.log('Checkbox clicked. New checked value:', checked);
                  setAiSendFractionated(!!checked);
                }}
                disabled={workspaceLoading}
              />
              <Label htmlFor="ai_send_fractionated" className="text-foreground">
                Enviar resposta da IA fracionada (em parágrafos)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Se marcado, divide respostas longas em parágrafos com delay fixo de 3 segundos entre eles. 
              Se desmarcado, envia a resposta completa em uma única mensagem.
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="border-t border-border pt-4">
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const { isLoading: workspaceLoading } = useWorkspace(); 

  return (
    <Button type="submit" disabled={pending || workspaceLoading}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
      {pending ? 'Salvando...' : 'Salvar Configurações de IA'}
    </Button>
  );
}