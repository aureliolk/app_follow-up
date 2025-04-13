'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import type { Client } from '@/app/types';
import { toast } from 'react-hot-toast';

// Tipo para o formulário interno, incluindo tags como string
type ClientSidebarFormData = {
  name?: string | null;
  phone_number?: string | null;
  tags?: string; // Tags como string separada por vírgulas para o input
};

interface ClientInfoSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  clientData: { 
      id: string;
      name?: string | null;
      phone_number?: string | null;
      metadata?: any | null; // Adicionar metadata para buscar tags
  } | null | undefined;
  onSave: (clientId: string, updatedData: { name?: string | null; phone_number?: string | null; metadata?: any }) => Promise<void>;
  onDelete: (clientId: string) => Promise<void>;
}

export default function ClientInfoSidebar({
  isOpen,
  onClose,
  clientData,
  onSave,
  onDelete,
}: ClientInfoSidebarProps) {
  const [formData, setFormData] = useState<ClientSidebarFormData>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientData) {
      // Tenta extrair tags do metadata, se existir e for um array
      const tagsString = Array.isArray(clientData.metadata?.tags) 
        ? clientData.metadata.tags.join(', ') 
        : '';
      setFormData({
        name: clientData.name || '',
        phone_number: clientData.phone_number || '',
        tags: tagsString,
      });
    } else {
      setFormData({}); // Limpa se não houver dados
    }
    setError(null); // Limpa erro ao abrir/mudar cliente
    setIsDeleting(false); // Garante reset do estado de delete
    setShowDeleteConfirm(false);
  }, [clientData, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!clientData?.id || isSaving) return;

    setIsSaving(true);
    setError(null);

    // Processa as tags: string separada por vírgula -> array de strings (removendo espaços e vazios)
    const parsedTags = formData.tags
      ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '')
      : [];

    const dataToSave = {
      name: formData.name,
      phone_number: formData.phone_number,
      metadata: { 
        ...(clientData?.metadata || {}), // Preserva outros metadados
        tags: parsedTags 
      }
    };

    console.log("Salvando dados do cliente:", dataToSave); // Log dos dados processados
    try {
      await onSave(clientData.id, dataToSave); // Chama a prop onSave com ID e dados
      toast.success('Informações do cliente atualizadas!');
      onClose(); // Fechar o sidebar em caso de sucesso
    } catch (err: any) {
      const message = err.message || 'Falha ao atualizar informações do cliente.';
      console.error("Erro ao salvar cliente:", err);
      setError(message);
      toast.error(`Erro ao salvar: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler para confirmar exclusão
  const handleDeleteConfirm = async () => {
    if (!clientData?.id || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(clientData.id); // Chama a prop onDelete
      toast.success('Contato excluído com sucesso!');
      setShowDeleteConfirm(false); // Fecha diálogo
      onClose(); // Fecha sidebar
    } catch (err: any) {
       const message = err.message || 'Falha ao excluir contato.';
      console.error("Erro ao excluir cliente:", err);
      setError(message);
      toast.error(`Erro ao excluir: ${message}`);
      setShowDeleteConfirm(false); // Fecha diálogo mesmo com erro
    } finally {
      setIsDeleting(false);
    }
  };

  // Fallback se não houver dados do cliente
  if (!clientData) {
      return null; // Ou um estado de loading/placeholder dentro do SheetContent?
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="sm:max-w-lg bg-card border-l border-border flex flex-col">
          <SheetHeader className="pr-6">
            <SheetTitle className="text-card-foreground">Informações do Contato</SheetTitle>
            <SheetDescription>
              Visualize e edite os detalhes deste contato.
            </SheetDescription>
          </SheetHeader>

          {/* Formulário */}
          <div className="flex-grow overflow-y-auto py-4 pr-6 space-y-4">
            {error && (
              <div className="my-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-foreground">Nome</Label>
              <Input
                id="name" name="name"
                value={formData.name || ''}
                onChange={handleChange}
                className="bg-input border-input"
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone_number" className="text-foreground">Telefone</Label>
              <Input
                id="phone_number" name="phone_number"
                value={formData.phone_number || ''}
                onChange={handleChange}
                className="bg-input border-input"
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags" className="text-foreground">Tags</Label>
              <Input
                id="tags" name="tags"
                value={formData.tags || ''}
                onChange={handleChange}
                placeholder="Ex: lead, cliente ativo, suporte"
                className="bg-input border-input"
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">Separe as tags por vírgula.</p>
            </div>

          </div>

          {/* Rodapé com Ações */}
          <SheetFooter className="mt-auto pt-4 border-t border-border flex justify-between">
            {/* Botão Deletar (Abre o AlertDialog manualmente) */}
            <Button 
              variant="destructive" 
              size="sm" 
              disabled={isSaving || isDeleting}
              onClick={() => setShowDeleteConfirm(true)} // <<< Abre o diálogo manualmente
            >
              Deletar Contato
            </Button>

            <div className="flex gap-2">
              <SheetClose asChild>
                <Button variant="outline" disabled={isSaving || isDeleting}>Cancelar</Button>
              </SheetClose>
              <Button onClick={handleSave} disabled={isSaving || isDeleting}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* AlertDialog movido para fora do Sheet */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este contato ({clientData?.name || clientData?.phone_number})?
              Esta ação não pode ser desfeita e removerá o contato permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 