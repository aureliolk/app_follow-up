// app/workspace/[slug]/clients/components/ClientFormModal.tsx
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Plus } from 'lucide-react';
import { useClient } from '@/context/client-context';
import type { Client, ClientFormData } from '@/app/types';
import { toast } from 'react-hot-toast';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: Client | null;
}

const defaultFormData: ClientFormData = {
  name: '',
  phone_number: '',
  external_id: '',
  channel: '',
  tags: [],
};

export default function ClientFormModal({
  isOpen,
  onClose,
  initialData,
}: ClientFormModalProps) {
  const { createClient, updateClient } = useClient();
  const [formData, setFormData] = useState<ClientFormData>(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      if (initialData) {
        // Preenche para edição
        setFormData({
          name: initialData.name || '',
          phone_number: initialData.phone_number || '',
          external_id: initialData.external_id || '',
          channel: initialData.channel || '',
          tags: initialData.tags || [],
        });
      } else {
        setFormData(defaultFormData); // Reset para criação
      }
    }
  }, [initialData, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    
    // Verificar se a tag já existe
    if (formData.tags?.includes(newTag.trim())) {
      toast.error('Esta tag já existe');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      tags: [...(prev.tags || []), newTag.trim()]
    }));
    setNewTag('');
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmitInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validar campos obrigatórios (Nome ou Telefone, por exemplo)
    if (!formData.name && !formData.phone_number) {
      setFormError("É necessário fornecer pelo menos o Nome ou o Telefone.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    try {
      // Preparar dados para incluir tags no metadata
      const clientDataWithMetadata = {
        ...formData,
        metadata: {
          tags: formData.tags || []
        }
      };

      if (initialData?.id) {
        // --- Edição ---
        console.log(`Modal: Atualizando cliente ${initialData.id}`, clientDataWithMetadata);
        await updateClient(initialData.id, clientDataWithMetadata);
        toast.success('Cliente atualizado com sucesso!');
      } else {
        // --- Criação ---
        console.log("Modal: Criando novo cliente", clientDataWithMetadata);
        await createClient(clientDataWithMetadata);
        toast.success('Cliente criado com sucesso!');
      }
      onClose();
    } catch (err: any) {
      console.error("Modal: Erro ao salvar cliente:", err);
      const message = err.response?.data?.error || err.message || 'Falha ao salvar o cliente.';
      setFormError(message);
      toast.error(`Erro: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            {initialData ? 'Editar Cliente' : 'Adicionar Novo Cliente'}
          </DialogTitle>
          <DialogDescription>
            {initialData
              ? 'Modifique os detalhes do cliente.'
              : 'Preencha as informações do novo cliente.'}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <div className="my-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmitInternal} className="space-y-4 py-4">
          {/* Campo Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-foreground">Nome</Label>
            <Input
              id="name" name="name"
              value={formData.name ?? ''} onChange={handleChange}
              className="bg-input border-input"
              disabled={isSubmitting}
              placeholder="Nome do Cliente"
            />
          </div>

          {/* Campo Telefone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone_number" className="text-foreground">Telefone</Label>
            <Input
              id="phone_number" name="phone_number" type="tel"
              value={formData.phone_number ?? ''} onChange={handleChange}
              className="bg-input border-input"
              disabled={isSubmitting}
              placeholder="(XX) XXXXX-XXXX"
            />
          </div>

          {/* Campo Canal (Opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="channel" className="text-foreground">Canal (Opcional)</Label>
            <Input
              id="channel" name="channel"
              value={formData.channel ?? ''} onChange={handleChange}
              className="bg-input border-input"
              disabled={isSubmitting}
              placeholder="Ex: WHATSAPP, CHATWOOT"
            />
             <p className="text-xs text-muted-foreground">Identifica a origem do contato (ajuda a evitar duplicados).</p>
          </div>

           {/* Campo ID Externo (Opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="external_id" className="text-foreground">ID Externo (Opcional)</Label>
            <Input
              id="external_id" name="external_id"
              value={formData.external_id ?? ''} onChange={handleChange}
              className="bg-input border-input"
              disabled={isSubmitting}
               placeholder="ID do contato no sistema de origem"
            />
          </div>

          {/* Campo Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="tags" className="text-foreground">Tags</Label>
            <div className="flex space-x-2">
              <Input
                id="newTag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                className="bg-input border-input flex-1"
                disabled={isSubmitting}
                placeholder="Adicionar nova tag"
              />
              <Button 
                type="button" 
                variant="outline" 
                size="icon" 
                onClick={handleAddTag}
                disabled={isSubmitting || !newTag.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.tags?.map(tag => (
                <Badge key={tag} variant="secondary" className="p-1 px-2">
                  {tag}
                  <button 
                    type="button" 
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isSubmitting}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {!formData.tags?.length && (
                <span className="text-xs text-muted-foreground">Nenhuma tag adicionada</span>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border">
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || (!formData.name && !formData.phone_number)}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isSubmitting ? 'Salvando...' : (initialData ? 'Salvar Alterações' : 'Criar Cliente')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}