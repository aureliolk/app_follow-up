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

const AVAILABLE_MODELS = [
    { value: 'gpt-4o', label: 'OpenAI GPT-4o (Recomendado)' },
    { value: 'gpt-3.5-turbo', label: 'OpenAI GPT-3.5 Turbo' },
    { value: 'gemini-2.5-pro-exp-03-25', label: 'Google Gemini 2.5 Pro' },
    // Adicionar outros modelos se necessário (Gemini, etc.)
];

export default function AISettingsForm() {
  const { workspace, isLoading: workspaceLoading, updateWorkspace, refreshWorkspaces } = useWorkspace();

  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelPreference, setModelPreference] = useState(() => {
      const initialValue = workspace?.ai_model_preference;
      return initialValue ?? AVAILABLE_MODELS[0].value;
  });
  const [aiName, setAiName] = useState('Beatriz');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspace) {
      console.log("[Effect] Setting state from workspace", workspace);
      const workspacePrompt = workspace.ai_default_system_prompt || '';
      if (workspacePrompt !== systemPrompt) {
          setSystemPrompt(workspacePrompt);
      }
      const workspaceModelPref = workspace.ai_model_preference ?? AVAILABLE_MODELS[0].value;
      if (workspaceModelPref !== modelPreference) {
          console.log(`[Effect] Model preference changed in workspace. Updating state from '${modelPreference}' to '${workspaceModelPref}'`);
          setModelPreference(workspaceModelPref);
      }
      const workspaceAiName = workspace.ai_name || 'Beatriz';
      if (workspaceAiName !== aiName) {
          console.log(`[Effect] AI Name changed. Updating state from '${aiName}' to '${workspaceAiName}'`);
          setAiName(workspaceAiName);
      }
    }
  }, [workspace]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace) return;

    setIsSaving(true);
    setError(null);

    const dataToUpdate: { ai_default_system_prompt?: string | null; ai_model_preference?: string | null; ai_name?: string | null } = {};
    let changed = false;

    const currentPrompt = workspace.ai_default_system_prompt || '';
    const currentModel = workspace.ai_model_preference || AVAILABLE_MODELS[0].value;
    const currentAiName = workspace.ai_name || 'Beatriz';

    console.log("AISettingsForm handleSubmit: Comparing values");
    console.log("  Current Prompt:", `"${currentPrompt}"`);
    console.log("  New Prompt:", `"${systemPrompt}"`);
    console.log("  Current Model:", `"${currentModel}"`);
    console.log("  New Model:", `"${modelPreference}"`);
    console.log("  Current AI Name:", `"${currentAiName}"`);
    console.log("  New AI Name:", `"${aiName}"`);

    if (systemPrompt.trim() !== currentPrompt.trim()) {
      dataToUpdate.ai_default_system_prompt = systemPrompt.trim() === '' ? null : systemPrompt.trim();
      changed = true;
      console.log("  -> Prompt changed. Adding to update.");
    }

    if (modelPreference !== currentModel) {
      dataToUpdate.ai_model_preference = modelPreference;
      changed = true;
      console.log("  -> Model changed. Adding to update.");
    }

    if (aiName.trim() !== currentAiName.trim()) {
      dataToUpdate.ai_name = aiName.trim() === '' ? 'Beatriz' : aiName.trim();
      changed = true;
      console.log("  -> AI Name changed. Adding to update.");
    }

    if (!changed) {
      toast.success('Nenhuma alteração detectada.');
      setIsSaving(false);
      console.log("AISettingsForm handleSubmit: No changes detected.");
      return;
    }

    console.log("AISettingsForm handleSubmit: Sending update payload:", dataToUpdate);

    try {
      await updateWorkspace(workspace.id, dataToUpdate);
      toast.success('Configurações de IA salvas com sucesso!');
      console.log("AISettingsForm handleSubmit: Update successful via context.");
    } catch (err: any) {
      console.error("AISettingsForm handleSubmit: Erro ao salvar configurações de IA via contexto:", err);
      const message = err.message || 'Ocorreu um erro ao salvar.';
      setError(message);
      toast.error(`Erro ao salvar: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (workspaceLoading && !workspace) {
    return <p className="text-muted-foreground">Carregando dados do workspace...</p>;
  }

  return (
    <Card className="border-border bg-card w-full">
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

          <div className="space-y-1.5">
            <Label htmlFor="ai_name" className="text-foreground">
              Nome da IA
            </Label>
            <Input
              id="ai_name"
              name="ai_name"
              value={aiName}
              onChange={(e) => setAiName(e.target.value)}
              placeholder="Ex: Beatriz, Atendente Virtual"
              className="bg-input border-input w-full md:w-1/2"
              disabled={isSaving || workspaceLoading}
              maxLength={50}
            />
             <p className="text-xs text-muted-foreground">
                Este nome será usado para assinar as mensagens enviadas pela IA.
             </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai_model_preference" className="text-foreground">
              Modelo de IA Preferido
            </Label>
            <Select
                name="ai_model_preference"
                value={modelPreference}
                onValueChange={(value) => setModelPreference(value)}
                disabled={isSaving || workspaceLoading}
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
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Descreva aqui a persona da IA, o produto/serviço, objetivos da conversa, tom de voz, informações importantes, etc."
              className="bg-input border-input min-h-[250px] font-mono text-sm"
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