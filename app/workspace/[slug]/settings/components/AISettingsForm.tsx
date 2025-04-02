// app/workspace/[slug]/settings/components/AISettingsForm.tsx
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axios from 'axios';

const AVAILABLE_MODELS = [
    { value: 'gpt-4o', label: 'OpenAI GPT-4o (Recomendado)' },
    { value: 'gpt-3.5-turbo', label: 'OpenAI GPT-3.5 Turbo' },
    // Adicionar outros modelos se necessário (Gemini, etc.)
];

export default function AISettingsForm() {
  const { workspace, isLoading: workspaceLoading, updateWorkspace, refreshWorkspaces } = useWorkspace(); // <<< Usar updateWorkspace do contexto

  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspace) {
      console.log("AISettingsForm useEffect: Setting state from workspace", workspace);
      setSystemPrompt(workspace.ai_default_system_prompt || '');
      // Define o valor inicial do select. Se não houver preferência salva, usa o primeiro da lista.
      setModelPreference(workspace.ai_model_preference || AVAILABLE_MODELS[0].value);
    }
  }, [workspace]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace) return;

    setIsSaving(true);
    setError(null);

    const dataToUpdate: { ai_default_system_prompt?: string | null; ai_model_preference?: string | null } = {};
    let changed = false;

    // <<< LÓGICA DE COMPARAÇÃO AJUSTADA >>>
    const currentPrompt = workspace.ai_default_system_prompt || '';
    const currentModel = workspace.ai_model_preference || AVAILABLE_MODELS[0].value;

    console.log("AISettingsForm handleSubmit: Comparing values");
    console.log("  Current Prompt:", `"${currentPrompt}"`);
    console.log("  New Prompt:", `"${systemPrompt}"`);
    console.log("  Current Model:", `"${currentModel}"`);
    console.log("  New Model:", `"${modelPreference}"`);

    // Verifica se o prompt mudou (considerando null/undefined como string vazia para comparação)
    if (systemPrompt.trim() !== currentPrompt.trim()) {
      dataToUpdate.ai_default_system_prompt = systemPrompt.trim() === '' ? null : systemPrompt.trim();
      changed = true;
      console.log("  -> Prompt changed. Adding to update.");
    }

    // Verifica se o modelo mudou
    if (modelPreference !== currentModel) {
      dataToUpdate.ai_model_preference = modelPreference;
      changed = true;
      console.log("  -> Model changed. Adding to update.");
    }

    if (!changed) {
      toast.success('Nenhuma alteração detectada.');
      setIsSaving(false);
      console.log("AISettingsForm handleSubmit: No changes detected.");
      return;
    }

    console.log("AISettingsForm handleSubmit: Sending update payload:", dataToUpdate);

    try {
      // <<< USAR updateWorkspace DO CONTEXTO >>>
      // A função do contexto já lida com a chamada API e o refresh
      await updateWorkspace(workspace.id, dataToUpdate);
      toast.success('Configurações de IA salvas com sucesso!');
      // Não precisamos chamar refreshWorkspaces explicitamente aqui, pois updateWorkspace já deve fazer isso.
      console.log("AISettingsForm handleSubmit: Update successful via context.");
    } catch (err: any) {
      console.error("AISettingsForm handleSubmit: Erro ao salvar configurações de IA via contexto:", err);
      // O erro já deve ser tratado e exibido pelo contexto, mas podemos adicionar um log extra
      const message = err.message || 'Ocorreu um erro ao salvar.';
      setError(message); // Pode mostrar erro localmente também
      toast.error(`Erro ao salvar: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ... (restante do JSX do formulário permanece o mesmo) ...
   if (workspaceLoading && !workspace) { // Mostrar loading apenas se o workspace ainda não carregou
    return <p className="text-muted-foreground">Carregando dados do workspace...</p>;
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Configurações da Inteligência Artificial</CardTitle>
        <CardDescription>
          Personalize o comportamento da IA para este workspace. Defina a persona, o contexto e os objetivos.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
              {error}
            </div>
          )}

          {/* Campo Modelo de IA */}
          <div className="space-y-1.5">
            <Label htmlFor="ai_model_preference" className="text-foreground">
              Modelo de IA Preferido
            </Label>
            <Select
                name="ai_model_preference"
                value={modelPreference} // Usa o estado local
                onValueChange={(value) => setModelPreference(value)} // Atualiza o estado local
                disabled={isSaving}
            >
              <SelectTrigger className="w-full md:w-1/2 bg-input border-input">
                {/* Garante que o placeholder só aparece se não houver valor */}
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


          {/* Campo Prompt Principal */}
          <div className="space-y-1.5">
            <Label htmlFor="ai_default_system_prompt" className="text-foreground">
              Prompt Principal do Sistema (Contexto da IA)
            </Label>
            <Textarea
              id="ai_default_system_prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Descreva aqui a persona da IA, o produto/serviço, objetivos da conversa, tom de voz, informações importantes, etc."
              className="bg-input border-input min-h-[250px] font-mono text-sm" // Aumentar altura e usar fonte mono
              disabled={isSaving}
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
          <Button type="submit" disabled={isSaving || workspaceLoading}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isSaving ? 'Salvando...' : 'Salvar Configurações de IA'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}