'use client';

import { useState, useEffect, useRef } from 'react';
import { X, PlusCircle, Search, Loader2, UserCog, Check, CheckCheck } from 'lucide-react';
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import axios from 'axios';
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
      workspace_id: string;
      name?: string | null;
      phone_number?: string | null;
      metadata?: any | null; // Adicionar metadata para buscar tags
  } | null | undefined;
  onSave: (clientId: string, updatedData: { name?: string | null; phone_number?: string | null; metadata?: any }) => Promise<void>;
  onDelete: (clientId: string) => Promise<void>;
}

const MOCK_AVAILABLE_TAGS = ['lead', 'cliente ativo', 'suporte', 'vip', 'cancelado', 'orçamento']; // Mock inicial

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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>(MOCK_AVAILABLE_TAGS);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para controle de API de Tags
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  useEffect(() => {
    // Função para buscar tags disponíveis
    const fetchAvailableTags = async (workspaceId: string) => {
        setIsLoadingTags(true);
        try {
            console.log(`[Tags] Fetching available tags for workspace ${workspaceId}...`);
            const response = await axios.get<{ success: boolean; data?: string[] }>(`/api/workspaces/${workspaceId}/tags`);
            if (response.data.success && Array.isArray(response.data.data)) {
                setAvailableTags(response.data.data);
                 console.log(`[Tags] Found ${response.data.data.length} available tags.`);
            } else {
                console.warn('[Tags] Failed to fetch available tags or invalid format:', response.data);
                setAvailableTags(MOCK_AVAILABLE_TAGS); // Fallback para mock em caso de erro
                toast.error('Não foi possível carregar as tags disponíveis.');
            }
        } catch (err) {
            console.error('[Tags] Error fetching available tags:', err);
            setAvailableTags(MOCK_AVAILABLE_TAGS); // Fallback para mock em caso de erro
            toast.error('Erro ao carregar as tags disponíveis.');
        } finally {
            setIsLoadingTags(false);
        }
    };

    if (clientData && isOpen) { // Busca tags quando abre e tem dados
      fetchAvailableTags(clientData.workspace_id); // <<< Assumindo que clientData tem workspace_id

      const currentTags = Array.isArray(clientData.metadata?.tags)
        ? clientData.metadata.tags.map(String)
        : [];
      setSelectedTags(currentTags);
      setFormData({
        name: clientData.name || '',
        phone_number: clientData.phone_number || '',
      });
    } else {
      setFormData({});
      setSelectedTags([]);
    }
    setError(null);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  }, [clientData, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'name' || name === 'phone_number') {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // --- Handlers de Tags ---
  const handleTagSelect = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
    setSearchTerm('');
    setIsTagDialogOpen(false);
  };

  const handleTagRemove = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleCreateTag = async (newTag: string) => {
    if (!clientData?.workspace_id || isCreatingTag) return;

    const trimmedTag = newTag.trim();
    if (trimmedTag && !availableTags.includes(trimmedTag) && !selectedTags.includes(trimmedTag)) {
      setIsCreatingTag(true);
      try {
        console.log(`[Tags] Attempting to create tag: ${trimmedTag} for workspace ${clientData.workspace_id}`);
        const response = await axios.post<{ success: boolean; data?: { name: string } }>(`/api/workspaces/${clientData.workspace_id}/tags`, { name: trimmedTag });
        
        if (response.data.success && response.data.data?.name) {
            const createdTag = response.data.data.name;
            setAvailableTags([...availableTags, createdTag]); // Adiciona à lista local
            setSelectedTags([...selectedTags, createdTag]); // Seleciona a nova tag
            toast.success(`Tag "${createdTag}" criada!`);
            console.log(`[Tags] Tag criada com sucesso: ${createdTag}`);
        } else {
             console.error('[Tags] Failed to create tag via API:', response.data);
             toast.error(`Falha ao criar tag "${trimmedTag}".`);
        }
      } catch (err) {
          console.error('[Tags] Error calling create tag API:', err);
          toast.error(`Erro ao criar tag "${trimmedTag}".`);
      } finally {
          setIsCreatingTag(false);
      }
    }
    setSearchTerm('');
    setIsTagDialogOpen(false);
  };

  // Filtra tags disponíveis baseado na busca e nas já selecionadas
  const filteredAvailableTags = availableTags.filter(
    tag => 
      !selectedTags.includes(tag) && 
      tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async () => {
    if (!clientData?.id || isSaving) return;

    setIsSaving(true);
    setError(null);

    const dataToSave = {
      name: formData.name,
      phone_number: formData.phone_number,
      metadata: { 
        ...(clientData?.metadata || {}),
        tags: selectedTags
      }
    };

    console.log("Salvando dados do cliente:", dataToSave);
    try {
      await onSave(clientData.id, dataToSave);
      toast.success('Informações do cliente atualizadas!');
      onClose();
    } catch (err: any) {
      const message = err.message || 'Falha ao atualizar informações do cliente.';
      console.error("Erro ao salvar cliente:", err);
      setError(message);
      toast.error(`Erro ao salvar: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!clientData?.id || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(clientData.id);
      toast.success('Contato excluído com sucesso!');
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
       const message = err.message || 'Falha ao excluir contato.';
      console.error("Erro ao excluir cliente:", err);
      setError(message);
      toast.error(`Erro ao excluir: ${message}`);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!clientData) {
      return null;
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
            {/* <p>ID do workspace: {clientData?.workspace_id}</p>
            <p>ID do contato: {clientData?.id}</p> */}
          </SheetHeader>

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
              <Label className="text-foreground">Tags</Label>
              <div className="flex flex-wrap items-center gap-1 min-h-[40px] p-2 border border-input rounded-md bg-input">
                  {/* Renderiza Badges para tags selecionadas */} 
                  {selectedTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                          {tag}
                          <button
                              type="button"
                              onClick={() => handleTagRemove(tag)}
                              className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                              aria-label={`Remover tag ${tag}`}
                              disabled={isSaving}
                          >
                              <X className="h-3 w-3" />
                          </button>
                      </Badge>
                  ))}

                  {/* Dialog para adicionar/buscar/criar tags */} 
                  <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                      <DialogTrigger asChild>
                          <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={isSaving}
                          >
                              <PlusCircle className="mr-1 h-3 w-3" /> Add Tag
                          </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[350px] p-0">
                          <DialogHeader className="p-4 pb-2">
                            <DialogTitle>Selecionar ou Criar Tags</DialogTitle>
                          </DialogHeader>
                          <div className="px-4 pb-4">
                              <Command>
                                  <CommandInput
                                      placeholder="Buscar ou criar tag..."
                                      value={searchTerm}
                                      onValueChange={setSearchTerm}
                                  />
                                  <CommandList>
                                      <CommandEmpty>
                                          {searchTerm && !filteredAvailableTags.length && !isLoadingTags ? (
                                              <Button
                                                  variant="ghost"
                                                  className="w-full justify-start text-left h-8 px-2 py-1.5 text-sm"
                                                  onClick={() => handleCreateTag(searchTerm)}
                                                  disabled={isCreatingTag}
                                              >
                                                  {isCreatingTag ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />} 
                                                  Criar "{searchTerm}"
                                              </Button>
                                          ) : !isLoadingTags ? (
                                              <span className="py-6 text-center text-sm block">
                                                  Nenhuma tag encontrada.
                                              </span>
                                          ) : null}
                                      </CommandEmpty>
                                      {filteredAvailableTags.length > 0 && (
                                          <CommandGroup heading="Tags Disponíveis">
                                              {filteredAvailableTags.map((tag) => (
                                                  <CommandItem
                                                      key={tag}
                                                      value={tag} 
                                                      onSelect={() => handleTagSelect(tag)}
                                                  >
                                                      {tag}
                                                  </CommandItem>
                                              ))}
                                          </CommandGroup>
                                      )}
                                  </CommandList>
                              </Command>
                          </div>
                      </DialogContent>
                  </Dialog>
              </div>
            </div>

          </div>

          <SheetFooter className="mt-auto pt-4 border-t border-border flex justify-between">
            <Button 
              variant="destructive" 
              size="sm" 
              disabled={isSaving || isDeleting}
              onClick={() => setShowDeleteConfirm(true)}
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