// app/workspace/[slug]/settings/components/AISettingsForm.tsx
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useFormStatus } from 'react-dom';
import { useTransition } from 'react';
import { updateAiSettingsAction } from '@/lib/actions/workspaceSettingsActions';
import { useActionState } from 'react';

// Lista atualizada de modelos disponíveis
const AVAILABLE_MODELS = [
    { value: 'openrouter/openai/gpt-4o-mini', label: 'OpenAI: GPT-4o Mini' },
    { value: 'openrouter/google/gemini-2.5-pro-preview-03-25', label: 'Google: Gemini 2.5 Pro Preview' },
    { value: 'openrouter/google/gemini-2.0-flash-001', label: 'Google: Gemini 2.0 Flash' },
    { value: 'openrouter/x-ai/grok-3-beta', label: 'XAI: Grok-3 Beta' },
    { value: 'openrouter/x-ai/grok-3-mini-beta', label: 'XAI: Grok-3 Mini Beta' },
    { value: 'openrouter/deepseek/deepseek-chat-v3-0324', label: 'DeepSeek: DeepSeek Chat v3' },
];

export default function AISettingsForm() {
  const { workspace, isLoading: workspaceLoading, updateWorkspace } = useWorkspace(); // Removido refreshWorkspaces se não usado aqui

  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [aiName, setAiName] = useState('');
  const [aiDelayBetweenMessages, setAiDelayBetweenMessages] = useState<number>(3000); // Manter como number
  const [initialized, setInitialized] = useState(false);

  // Estado para gerenciar o resultado da Server Action
  const [state, formAction] = useActionState(
    // A action recebe o estado anterior e o FormData
    // Usamos bind para passar o workspaceId como primeiro argumento da action
    // A action agora espera { workspaceId: string, ...formData }
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
            // Converter o delay de string para number/null
            ai_delay_between_messages: formData.get('ai_delay_between_messages') ? parseInt(formData.get('ai_delay_between_messages') as string, 10) : null,
        };

        // Chamar a Server Action
        return await updateAiSettingsAction(data);
    },
    // Estado inicial (null ou um objeto indicando sem ação)
    null
  );

  // Efeito para mostrar toasts com base no resultado da Server Action
  useEffect(() => {
    if (state) {
        if (state.success) {
            toast.success('Configurações de IA salvas com sucesso!');
        } else if (state.error) {
            toast.error(`Erro ao salvar: ${state.error}`);
        }
    }
  }, [state]); // Depende do estado da action

  useEffect(() => {
    if (workspace && !initialized) {
      console.log("[Effect] Setting state from workspace", workspace);
      console.log("[Effect] Loaded Model Preference from workspace:", workspace.ai_model_preference);
      console.log("[Effect] Loaded AI Delay from workspace:", workspace.ai_delay_between_messages);

      setSystemPrompt(workspace.ai_default_system_prompt || '');
      setModelPreference(workspace.ai_model_preference || AVAILABLE_MODELS[0].value);
      setAiName(workspace.ai_name || 'Beatriz');
      setAiDelayBetweenMessages(
        workspace.ai_delay_between_messages === null || workspace.ai_delay_between_messages === undefined
          ? 3000
          : Number(workspace.ai_delay_between_messages)
      );
      setInitialized(true);
    }
  }, [workspace, initialized]);

  // Renderizar o formulário somente se o workspace estiver carregado
  if (workspaceLoading || !workspace || !initialized) {
    // Se estiver carregando ou não inicializado, mostre um spinner ou mensagem
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
          <div className="flex flex-col md:flex-row gap-4">
           <div className="w-full ">
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
              disabled={workspaceLoading || undefined}
              maxLength={50}
            />
             <p className="text-xs text-muted-foreground">
                Este nome será usado para assinar as mensagens enviadas pela IA.
             </p>
           </div>
           <div className="w-full md:w-1/2">
            <Label htmlFor="ai_delay_between_messages" className="text-foreground">
              Tempo de espera entre mensagens (ms)
            </Label>
            <Input
              type="number"
              id="ai_delay_between_messages"
              name="ai_delay_between_messages"
              value={aiDelayBetweenMessages}
              onChange={(e) => setAiDelayBetweenMessages(parseInt(e.target.value, 10) || 0)}
              placeholder="Ex: 3000"
              className="bg-input border-input w-full"
              disabled={workspaceLoading || undefined}
              min="0"
            />
            <p className="text-xs text-muted-foreground">
              Tempo em milissegundos. Ex: 3000 para 3 segundos.
            </p>
           </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai_model_preference" className="text-foreground">
              Modelo de IA Preferido
            </Label>
            <Select
                name="ai_model_preference"
                value={modelPreference}
                onValueChange={(value) => setModelPreference(value)}
                disabled={workspaceLoading || undefined}
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
              disabled={workspaceLoading || undefined}
            />
             <div className="text-xs text-muted-foreground flex items-start gap-1 pt-1">
                 <Info className="h-3 w-4 flex-shrink-0 mt-0.5" />
                 <span>
                    Este prompt define o comportamento base da IA. Quanto mais detalhado, melhor.
                    Inclua informações sobre o negócio, o que a IA deve ou não fazer, e o objetivo final da interação.
                 </span>
             </div>
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
    const { isLoading: workspaceLoadingContext } = useWorkspace(); 

    return (
        <Button type="submit" disabled={pending || workspaceLoadingContext}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {pending ? 'Salvando...' : 'Salvar Configurações de IA'}
        </Button>
    );
}
