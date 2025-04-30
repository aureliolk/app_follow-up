'use client';

import { useState, useTransition, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { updatePipelineStage } from '@/lib/actions/pipelineActions';
import type { PipelineStageBasic, PipelineStageUpdateInput } from '@/lib/types/pipeline';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils"; // Import cn

interface EditStageFormProps {
  workspaceId: string;
  stage: PipelineStageBasic; // Current stage data
  children: React.ReactNode; // Trigger button
}

export function EditStageForm({ workspaceId, stage, children }: EditStageFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color ?? '#94a3b8'); // Consistent default
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset form state when the dialog is opened or the stage prop changes
  useEffect(() => {
    if (isOpen) {
      setName(stage.name);
      setColor(stage.color ?? '#94a3b8');
      setError(null);
    }
  }, [isOpen, stage]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('O nome da etapa é obrigatório.');
      return;
    }
    // Basic color validation
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
        setError('Formato de cor inválido.');
        return;
    }

    const updateData: PipelineStageUpdateInput = {};
    let hasChanges = false;
    if (trimmedName !== stage.name) {
      updateData.name = trimmedName;
      hasChanges = true;
    }
    if (color !== (stage.color ?? '#94a3b8')) {
      updateData.color = color;
      hasChanges = true;
    }

    // If no changes, just close the dialog
    if (!hasChanges) {
      setIsOpen(false);
      return;
    }

    startTransition(async () => {
      let toastId: string | undefined;
      try {
        toastId = toast.loading('Atualizando etapa...');
        await updatePipelineStage(workspaceId, stage.id, updateData);
        toast.success('Etapa atualizada com sucesso!', { id: toastId });
        setIsOpen(false);
        setError(null);
      } catch (err) {
        console.error("Failed to update stage:", err);
        const message = err instanceof Error ? err.message : "Erro desconhecido ao atualizar etapa.";
        setError(message);
        toast.error(`Falha ao atualizar etapa: ${message}`, { id: toastId });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Etapa</DialogTitle>
          <DialogDescription>
            Altere o nome ou a cor da etapa "{stage.name}".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Name Input */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor={`edit-stage-name-${stage.id}`} className="text-right">
                Nome *
              </Label>
              <Input
                id={`edit-stage-name-${stage.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder="Ex: Lead Qualificado"
                required
                disabled={isPending}
              />
            </div>
            {/* Color Picker Input */}
            <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">
                 Cor *
               </Label>
               <div className="col-span-3">
                 <Popover>
                   <PopoverTrigger asChild>
                      <Button
                       variant={"outline"}
                       type="button" // Prevent form submission
                       className={cn(
                           "w-[150px] justify-start text-left font-normal",
                           !color && "text-muted-foreground"
                       )}
                       disabled={isPending}
                     >
                       <div className="w-4 h-4 rounded-full mr-2 border" style={{ backgroundColor: color }}></div>
                       {color ? <span style={{ mixBlendMode: 'difference', color: 'white' }}>{color}</span> : <span>Selecionar</span>}
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-auto p-0" align="start">
                     <HexColorPicker color={color} onChange={setColor} />
                   </PopoverContent>
                 </Popover>
               </div>
            </div>
            {error && <p className="text-sm text-destructive col-span-4 text-center pt-2">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
               <Button type="button" variant="outline" disabled={isPending}>
                 Cancelar
               </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || !name.trim() || !color}>
              {isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 