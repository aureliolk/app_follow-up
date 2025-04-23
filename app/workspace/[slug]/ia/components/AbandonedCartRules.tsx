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
import { Edit, Trash2, Clock, AlertTriangle, Loader2, Plus, ShoppingCart } from 'lucide-react'; // Adicionado ShoppingCart
import { toast } from 'react-hot-toast';
import { formatMsToDelayString } from '@/lib/timeUtils';
import { AbandonedCartRule as AbandonedCartPrismaRule } from '@prisma/client'; // <<< Tipo correto
// <<< PLACEHOLDERS para Server Actions - serão criadas depois >>>
import { createAbandonedCartRule, updateAbandonedCartRule, deleteAbandonedCartRule } from '@/lib/actions/abandonedCartRuleActions';

// Interface para os dados do formulário (mesma estrutura)
interface RuleFormData {
  delayString: string;
  messageContent: string;
}

// Props do componente
interface AbandonedCartRulesProps {
  initialRules: AbandonedCartPrismaRule[];
  workspaceId: string;
}

// --- COMPONENTE PRINCIPAL --- 
export default function AbandonedCartRules({ initialRules, workspaceId }: AbandonedCartRulesProps) {
  const [isPending, startTransition] = useTransition();

  // Estado local
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AbandonedCartPrismaRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({ delayString: '', messageContent: '' });
  const [formError, setFormError] = useState<string | null>(null);

  // Handlers do Formulário
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

  const handleOpenEditForm = (rule: AbandonedCartPrismaRule) => {
    setEditingRule(rule);
    setFormData({
      // <<< Converter BigInt para Number >>>
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

  // Salvar Regra (usando Server Actions)
  const handleSaveRule = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const data = new FormData();
    data.append('delayString', formData.delayString);
    data.append('messageContent', formData.messageContent);
    // Adicionar sequenceOrder se necessário (pode ser gerenciado no backend)
    // data.append('sequenceOrder', editingRule?.sequenceOrder.toString() || '0'); 

    startTransition(async () => {
      try {
        let result;
        if (editingRule) {
          console.log(`AbandonedCartRules: Chamando Server Action updateAbandonedCartRule para ${editingRule.id}`);
          // <<< USAR ACTION CORRETA >>>
          result = await updateAbandonedCartRule(editingRule.id, data);
        } else {
          console.log('AbandonedCartRules: Chamando Server Action createAbandonedCartRule');
          // <<< USAR ACTION CORRETA >>>
          result = await createAbandonedCartRule(workspaceId, data);
        }

        if (result.success) {
          toast.success(result.message || (editingRule ? 'Regra atualizada!' : 'Regra adicionada!'));
          handleCloseForm();
          // Revalidação no servidor deve atualizar a lista
        } else {
          const errorMessage = result.message || 'Falha ao salvar a regra.';
          setFormError(errorMessage);
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

  // Excluir Regra (usando Server Actions)
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra de carrinho abandonado?')) {
      return;
    }

    startTransition(async () => {
      try {
        console.log(`AbandonedCartRules: Chamando Server Action deleteAbandonedCartRule para ${ruleId}`);
        // <<< USAR ACTION CORRETA >>>
        const result = await deleteAbandonedCartRule(ruleId);

        if (result.success) {
          toast.success(result.message || 'Regra excluída com sucesso.');
          // Revalidação no servidor deve atualizar a lista
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
        {/* <<< ATUALIZAR TÍTULOS E DESCRIÇÕES >>> */}
        <CardTitle className="text-card-foreground flex items-center">
          <ShoppingCart size={20} className="mr-2 text-primary" />
          Recuperação de Carrinho Abandonado
        </CardTitle>
        <CardDescription>
          Configure mensagens automáticas para recuperar vendas de carrinhos abandonados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {initialRules.length > 0 ? (
          <div className="space-y-3 border border-border rounded-md p-2 bg-background/30">
            {initialRules.map((rule) => (
              <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded hover:bg-muted/50">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center text-sm font-medium text-foreground">
                    <Clock size={14} className="inline mr-1.5 text-muted-foreground" />
                    {/* <<< Atualizar texto >>> */}
                    Após <span className="font-semibold mx-1">{formatMsToDelayString(Number(rule.delay_milliseconds))}</span> do abandono
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
                    disabled={isPending}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Excluir Regra"
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 border border-dashed border-border rounded-md">
            {/* <<< Atualizar texto >>> */}
            <p className="text-muted-foreground">Nenhuma regra de recuperação de carrinho configurada.</p>
            <Button variant="link" className="mt-1 h-auto p-0 text-primary" onClick={handleOpenAddForm} disabled={isPending}>
              Adicionar a primeira regra
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t border-border pt-4">
        {/* <<< Atualizar texto >>> */}
        <Button onClick={handleOpenAddForm} disabled={isPending}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Regra de Carrinho
        </Button>
      </CardFooter>

      {/* Modal/Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && handleCloseForm()}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
             {/* <<< Atualizar título e descrição >>> */}
            <DialogTitle className="text-card-foreground">
              {editingRule ? 'Editar Regra de Carrinho' : 'Adicionar Nova Regra de Carrinho'}
            </DialogTitle>
            <DialogDescription>
              Defina o tempo após o abandono e a mensagem a ser enviada.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="my-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              {formError}
            </div>
          )}

          <form onSubmit={handleSaveRule} className="space-y-4 py-4">
            <div className="space-y-1.5">
              {/* <<< Atualizar label >>> */}
              <Label htmlFor="delayString" className="text-foreground">Tempo Após Abandono*</Label>
              <Input
                id="delayString" name="delayString"
                value={formData.delayString} onChange={handleFormChange}
                placeholder="Ex: 1h, 1d 12h"
                className="bg-input border-input"
                required disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Use 'm' para minutos, 'h' para horas, 'd' para dias. Ex: "1d 12h".
              </p>
            </div>
            <div className="space-y-1.5">
              {/* <<< Atualizar label >>> */}
              <Label htmlFor="messageContent" className="text-foreground">Mensagem de Recuperação*</Label>
              <Textarea
                id="messageContent" name="messageContent"
                value={formData.messageContent} onChange={handleFormChange}
                placeholder="Ex: Olá [NomeCliente], vimos que você deixou alguns itens no carrinho..."
                className="bg-input border-input min-h-[100px]"
                required disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Use placeholders como `[NomeCliente]`. Inclua um link para o carrinho se possível.
              </p>
            </div>
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
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
 