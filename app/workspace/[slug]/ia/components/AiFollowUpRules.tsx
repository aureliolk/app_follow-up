// app/workspace/[slug]/ia/components/AiFollowUpRules.tsx
'use client';

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Loader2, Plus, Edit2, Trash2, Clock, AlertCircle } from 'lucide-react';
import { useWorkspace } from '@/context/workspace-context'; // <<< USA O CONTEXTO
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { formatMsToDelayString } from '@/lib/timeUtils'; // <<< Importa formatador

// Interface para a regra - Alinhada com o que a API/Contexto vai fornecer
interface WorkspaceAiFollowUpRule {
  id: string;
  delay_milliseconds: string; // Vem como string da API/Contexto
  message_content: string;
  // created_at, updated_at // Opcional para exibição
}

// Interface para os dados do formulário (o que o usuário digita)
interface RuleFormData {
  delayString: string; // O usuário digita "2h", "1d"
  messageContent: string;
}

// --- COMPONENTE PRINCIPAL ---
export default function AiFollowUpRules() {
  // <<< OBTÉM DADOS E FUNÇÕES DO CONTEXTO >>>
  const {
    workspace,
    aiFollowUpRules,
    loadingAiFollowUpRules,
    aiFollowUpRulesError,
    fetchAiFollowUpRules,
    createAiFollowUpRule,
    updateAiFollowUpRule,
    deleteAiFollowUpRule,
    clearAiFollowUpRulesError,
  } = useWorkspace();

  // Estado local apenas para o formulário/modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkspaceAiFollowUpRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({ delayString: '', messageContent: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null); // Erro específico do modal

  // Buscar regras via contexto quando o workspace estiver pronto
  useEffect(() => {
    if (workspace?.id) {
      clearAiFollowUpRulesError(); // Limpa erros anteriores do contexto
      console.log(`AiFollowUpRules: Chamando fetchAiFollowUpRules para workspace ${workspace.id}`);
      fetchAiFollowUpRules(workspace.id);
    }
  }, [workspace?.id, fetchAiFollowUpRules, clearAiFollowUpRulesError]);

  // Handlers do Formulário (sem mudanças na lógica interna, apenas o que chamam)
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOpenAddForm = () => {
    setEditingRule(null);
    setFormData({ delayString: '', messageContent: '' });
    setFormError(null); // Limpa erro do form
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (rule: WorkspaceAiFollowUpRule) => {
    setEditingRule(rule);
    setFormData({
      // Formata o delay_milliseconds (string) de volta para a string legível do input
      delayString: formatMsToDelayString(rule.delay_milliseconds),
      messageContent: rule.message_content,
    });
    setFormError(null); // Limpa erro do form
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingRule(null);
    setFormError(null);
  };

  // Handler para salvar (agora chama o contexto)
  const handleSaveRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace?.id) return;

    // Validação do input (pode ser mais robusta)
    if (!formData.delayString.trim() || !formData.messageContent.trim()) {
      setFormError('O tempo e a mensagem são obrigatórios.');
      return;
    }
     // Validação básica do formato do tempo
     if (!formData.delayString.match(/^(\d+\s*[mhd])+$/i) && !formData.delayString.match(/^(\d+\s*w)+$/i)) {
        setFormError('Formato de tempo inválido. Use m, h, d ou w (ex: 2h, 1d 30m, 3w).');
        return;
    }


    setIsSaving(true);
    setFormError(null);
    clearAiFollowUpRulesError(); // Limpa erro do contexto

    // Os dados enviados para o contexto são os do formulário
    const ruleDataToSend: { delayString: string; messageContent: string } = {
        delayString: formData.delayString,
        messageContent: formData.messageContent,
    };

    try {
      if (editingRule) {
        console.log(`AiFollowUpRules: Chamando updateAiFollowUpRule para ${editingRule.id}`);
        // <<< CHAMA CONTEXTO UPDATE >>>
        await updateAiFollowUpRule(editingRule.id, ruleDataToSend, workspace.id);
        toast.success('Regra atualizada com sucesso!');
      } else {
        console.log('AiFollowUpRules: Chamando createAiFollowUpRule');
        // <<< CHAMA CONTEXTO CREATE >>>
        await createAiFollowUpRule(ruleDataToSend, workspace.id);
        toast.success('Regra adicionada com sucesso!');
      }
      handleCloseForm(); // Fecha o modal em caso de sucesso
    } catch (err: any) {
      // O erro principal deve vir de aiFollowUpRulesError, mas pegamos a mensagem aqui para o form
      const message = err.message || 'Falha ao salvar a regra.';
      console.error('Error saving rule via context:', err);
      setFormError(message); // Mostra erro dentro do modal
      toast.error(`Erro: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler para Deletar (agora chama o contexto)
  const handleDeleteRule = async (ruleId: string) => {
    if (!workspace?.id) return;
    if (!confirm('Tem certeza que deseja excluir esta regra de acompanhamento?')) {
      return;
    }
    clearAiFollowUpRulesError(); // Limpa erro do contexto

    try {
        console.log(`AiFollowUpRules: Chamando deleteAiFollowUpRule para ${ruleId}`);
        // <<< CHAMA CONTEXTO DELETE >>>
        await deleteAiFollowUpRule(ruleId, workspace.id);
        toast.success('Regra excluída com sucesso.');
    } catch (err: any) {
      // O erro será setado no aiFollowUpRulesError pelo contexto
      const message = err.message || 'Falha ao excluir a regra.';
      console.error('Error deleting rule via context:', err);
      toast.error(`Erro: ${message}`);
      // Não precisa setar o erro local aqui, usamos o do contexto na renderização principal
    } finally {
        // Parar loading específico se houver
    }
  };


  // --- RENDERIZAÇÃO ---
  return (
    <Card className="border-border bg-card w-full mt-6">
      <CardHeader>
        <CardTitle className="text-card-foreground">Acompanhamento por Inatividade</CardTitle>
        <CardDescription>
          Configure mensagens automáticas para reengajar clientes que pararam de responder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Exibição de Erro do Contexto */}
        {aiFollowUpRulesError && !isFormOpen && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md flex items-start gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {aiFollowUpRulesError}
          </div>
        )}

        {/* Estado de Carregamento do Contexto */}
        {loadingAiFollowUpRules && (
          <div className="flex justify-center items-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carregando regras...
          </div>
        )}

        {/* Lista de Regras (Usa dados do Contexto) */}
        {!loadingAiFollowUpRules && aiFollowUpRules.length > 0 && (
          <div className="space-y-3 border border-border rounded-md p-2 bg-background/30">
            {aiFollowUpRules.map((rule) => (
              <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded hover:bg-muted/50">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center text-sm font-medium text-foreground">
                    <Clock size={14} className="inline mr-1.5 text-muted-foreground" />
                    Após <span className="font-semibold mx-1">{formatMsToDelayString(rule.delay_milliseconds)}</span> de inatividade {/* Formata para exibição */}
                  </div>
                  <p className="text-sm text-muted-foreground pl-5 line-clamp-2" title={rule.message_content}>
                    Enviar: "{rule.message_content}"
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0 mt-2 sm:mt-0 justify-end">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => handleOpenEditForm(rule)} // Passa a regra completa
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Editar Regra"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => handleDeleteRule(rule.id)} // Chama a função local que usa o contexto
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Excluir Regra"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mensagem de Nenhuma Regra */}
        {!loadingAiFollowUpRules && aiFollowUpRules.length === 0 && !aiFollowUpRulesError && (
          <div className="text-center py-6 border border-dashed border-border rounded-md">
            <p className="text-muted-foreground">Nenhuma regra de acompanhamento configurada.</p>
            <Button variant="link" className="mt-1 h-auto p-0 text-primary" onClick={handleOpenAddForm}>
              Adicionar a primeira regra
            </Button>
          </div>
        )}
      </CardContent>

       <CardFooter className="border-t border-border pt-4">
          <Button onClick={handleOpenAddForm}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Regra
          </Button>
       </CardFooter>

      {/* Modal/Dialog (Formulário permanece igual, mas handleSaveRule foi modificado) */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && handleCloseForm()}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">
              {editingRule ? 'Editar Regra de Acompanhamento' : 'Adicionar Nova Regra'}
            </DialogTitle>
            <DialogDescription>
              Defina o tempo de inatividade e a mensagem a ser enviada.
            </DialogDescription>
          </DialogHeader>

           {/* Erro específico do formulário/modal */}
           {formError && (
            <div className="my-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md flex items-start gap-2">
               <AlertCircle className="h-5 w-5 flex-shrink-0" />
              {formError}
            </div>
          )}

          <form onSubmit={handleSaveRule} className="space-y-4 py-4">
            {/* Input delayString */}
            <div className="space-y-1.5">
              <Label htmlFor="delayString" className="text-foreground">Tempo de Inatividade*</Label>
              <Input
                id="delayString" name="delayString"
                value={formData.delayString} onChange={handleFormChange}
                placeholder="Ex: 30m, 2h, 1d, 1w"
                className="bg-input border-input"
                required disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Use 'm' para minutos, 'h' para horas, 'd' para dias, 'w' para semanas. Ex: "1d 12h".
              </p>
            </div>
            {/* Textarea messageContent */}
            <div className="space-y-1.5">
              <Label htmlFor="messageContent" className="text-foreground">Mensagem de Acompanhamento*</Label>
              <Textarea
                id="messageContent" name="messageContent"
                value={formData.messageContent} onChange={handleFormChange}
                placeholder="Digite a mensagem que será enviada ao cliente..."
                className="bg-input border-input min-h-[100px]"
                required disabled={isSaving}
              />
               <p className="text-xs text-muted-foreground">
                Você pode usar placeholders como `[NomeCliente]` que serão substituídos.
              </p>
            </div>
            {/* Footer com botões */}
            <DialogFooter className="pt-4 border-t border-border">
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={handleCloseForm} disabled={isSaving}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving || !formData.delayString || !formData.messageContent}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isSaving ? 'Salvando...' : (editingRule ? 'Salvar Alterações' : 'Adicionar Regra')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}