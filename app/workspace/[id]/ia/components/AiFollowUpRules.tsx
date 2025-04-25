// app/workspace/[slug]/ia/components/AiFollowUpRules.tsx
'use client';

import React, { useState, FormEvent, useTransition } from 'react';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Edit, Trash2, Clock, AlertTriangle, Loader2, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatMsToDelayString } from '@/lib/timeUtils';
import { WorkspaceAiFollowUpRule as PrismaRule } from '@prisma/client';
import { createFollowUpRule, updateFollowUpRule, deleteFollowUpRule } from '@/lib/actions/followUpRuleActions';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// Interface para os dados do formulário
interface RuleFormData {
  delayString: string;
  messageContent: string;
}

// <<< Definir Props >>>
interface AiFollowUpRulesProps {
  initialRules: PrismaRule[];
  workspaceId: string;
  // fetchError?: string | null; // Opcional: receber erro da busca inicial
}

// --- COMPONENTE PRINCIPAL ---
export default function AiFollowUpRules({ initialRules, workspaceId }: AiFollowUpRulesProps) {
  // <<< REMOVER ESTADO DO CONTEXTO >>>
  // const {
  //   workspace, ... // remover tudo relacionado a aiFollowUpRules do contexto
  // } = useWorkspace();

  // <<< Hook useTransition >>>
  const [isPending, startTransition] = useTransition();

  // Estado local para o formulário/modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PrismaRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({ delayString: '', messageContent: '' });
  // const [isSaving, setIsSaving] = useState(false); // <<< Usar isPending
  const [formError, setFormError] = useState<string | null>(null);

  // <<< REMOVER useEffect para buscar dados >>>
  // useEffect(() => {
  //   ...
  // }, [...]);

  // Handlers do Formulário (mudança mínima)
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOpenAddForm = () => {
    setEditingRule(null);
    setFormData({ delayString: '', messageContent: '' });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (rule: PrismaRule) => {
    setEditingRule(rule);
    setFormData({
      delayString: formatMsToDelayString(Number(rule.delay_milliseconds)),
      messageContent: rule.message_content,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingRule(null);
    setFormError(null);
  };

  // <<< ATUALIZAR handleSaveRule PARA USAR SERVER ACTIONS E TRANSITION >>>
  const handleSaveRule = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Criar FormData para enviar para a Server Action
    const data = new FormData();
    data.append('delayString', formData.delayString);
    data.append('messageContent', formData.messageContent);

    startTransition(async () => {
      try {
        let result;
        if (editingRule) {
          console.log(`AiFollowUpRules: Chamando Server Action updateFollowUpRule para ${editingRule.id}`);
          result = await updateFollowUpRule(editingRule.id, data);
        } else {
          console.log('AiFollowUpRules: Chamando Server Action createFollowUpRule');
          result = await createFollowUpRule(workspaceId, data);
        }

        if (result.success) {
          toast.success(result.message || (editingRule ? 'Regra atualizada!' : 'Regra adicionada!'));
          handleCloseForm();
        } else {
          // Mostrar erro de validação ou erro geral
          const errorMessage = result.message || 'Falha ao salvar a regra.';
          setFormError(errorMessage); // Mostra erro dentro do modal
          toast.error(`Erro: ${errorMessage}`);
          console.error('Server Action error:', result.errors || result.message);
        }
      } catch (err) {
        console.error('Error calling server action:', err);
        const message = (err instanceof Error) ? err.message : 'Ocorreu um erro inesperado.';
        setFormError(message);
        toast.error(`Erro: ${message}`);
      }
    });
  };

  // <<< ATUALIZAR handleDeleteRule PARA USAR SERVER ACTIONS E TRANSITION >>>
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra de acompanhamento?')) {
      return;
    }

    startTransition(async () => {
      try {
        console.log(`AiFollowUpRules: Chamando Server Action deleteFollowUpRule para ${ruleId}`);
        const result = await deleteFollowUpRule(ruleId);

        if (result.success) {
          toast.success(result.message || 'Regra excluída com sucesso.');
          // A revalidação no servidor atualizará a lista
        } else {
          const message = result.message || 'Falha ao excluir a regra.';
          toast.error(`Erro: ${message}`);
          console.error('Server Action error:', result.message);
        }
      } catch (err) {
        console.error('Error calling server action:', err);
        const message = (err instanceof Error) ? err.message : 'Ocorreu um erro inesperado.';
        toast.error(`Erro: ${message}`);
      }
    });
  };


  // --- RENDERIZAÇÃO ---
  return (
    <Card className="border-border bg-card w-full mt-6 rounded-xl shadow-md">
      <CardHeader>
        <CardTitle className="text-card-foreground">Acompanhamento por Inatividade</CardTitle>
        <CardDescription>
          Configure mensagens automáticas para reengajar clientes que pararam de responder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* <<< REMOVER Exibição de Erro e Loading do Contexto >>> */}
        {/* {aiFollowUpRulesError && !isFormOpen && (...)} */}
        {/* {loadingAiFollowUpRules && (...)} */}

        {/* Lista de Regras (Usa prop initialRules) */}
        {initialRules.length > 0 ? (
          <div className="space-y-3 border border-border rounded-md p-2 bg-background/30">
            {/* <<< Mapear initialRules >>> */}
            {initialRules.map((rule) => (
              <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded hover:bg-muted/50">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center text-sm font-medium text-foreground">
                    <Clock size={14} className="inline mr-1.5 text-muted-foreground" />
                    {/* <<< Converter BigInt para Number >>> */}
                    Após <span className="font-semibold mx-1">{formatMsToDelayString(Number(rule.delay_milliseconds))}</span> de inatividade
                  </div>
                  <p className="text-sm text-muted-foreground pl-5 line-clamp-2" title={rule.message_content}>
                    Enviar: "{rule.message_content}"
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0 mt-2 sm:mt-0 justify-end">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => handleOpenEditForm(rule)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Editar Regra"
                    disabled={isPending} // <<< Desabilitar durante transição
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Excluir Regra"
                    disabled={isPending} // <<< Desabilitar durante transição
                  >
                     {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} 
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Mensagem de Nenhuma Regra */
          <div className="text-center py-6 border border-dashed border-border rounded-md">
            <p className="text-muted-foreground">Nenhuma regra de acompanhamento configurada.</p>
            <Button variant="link" className="mt-1 h-auto p-0 text-primary" onClick={handleOpenAddForm} disabled={isPending}>
              Adicionar a primeira regra
            </Button>
          </div>
        )}
      </CardContent>

       <CardFooter className="border-t border-border pt-4">
          <Button onClick={handleOpenAddForm} disabled={isPending}> 
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Regra
          </Button>
       </CardFooter>

      {/* Modal/Dialog */}
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

          {/* Mensagem de erro do formulário */} 
          {formError && (
            <div className="my-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md flex items-start gap-2">
               <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Formulário aqui */}
          <form onSubmit={handleSaveRule} className="space-y-4 py-4">
            {/* Input delayString */}
            <div className="space-y-1.5">
              <Label htmlFor="delayString" className="text-foreground">Tempo de Inatividade*</Label>
              <Input
                id="delayString" name="delayString"
                value={formData.delayString} onChange={handleFormChange}
                placeholder="Ex: 30m, 2h, 1d" // Simplificado placeholder
                className="bg-input border-input"
                required disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Use 'm' para minutos, 'h' para horas, 'd' para dias. Ex: "1d 12h".
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
                required disabled={isPending}
              />
               <p className="text-xs text-muted-foreground">
                Você pode usar placeholders como `[NomeCliente]` que serão substituídos.
              </p>
            </div>
            {/* Footer com botões */}
            <DialogFooter className="pt-4 border-t border-border">
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={handleCloseForm} disabled={isPending}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending || !formData.delayString || !formData.messageContent}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isPending ? 'Salvando...' : (editingRule ? 'Salvar Alterações' : 'Adicionar Regra')}
              </Button>
            </DialogFooter>
          </form> { /* Fim da tag form */ }
          
        </DialogContent>
      </Dialog>
    </Card>
  );
}