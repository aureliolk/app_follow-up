'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-hot-toast';
import { createPipelineStage } from '@/lib/actions/pipelineActions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils"; // Import cn

interface AddStageFormProps {
  workspaceId: string;
  children: React.ReactNode; // To wrap the trigger button
}

export function AddStageForm({ workspaceId, children }: AddStageFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#94a3b8'); // Start with a neutral default color (e.g., slate-400)
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('O nome da etapa é obrigatório.');
      return;
    }
    // Basic color validation (hex format)
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
        setError('Formato de cor inválido.');
        return;
    }

    startTransition(async () => {
      let toastId: string | undefined;
      try {
        toastId = toast.loading('Criando etapa...');
        await createPipelineStage(workspaceId, name.trim(), color);
        toast.success('Etapa criada com sucesso!', { id: toastId });
        setIsOpen(false);
        setName('');
        setColor('#94a3b8'); // Reset to default
        setError(null);
      } catch (err) {
        console.error("Failed to create stage:", err);
        const message = err instanceof Error ? err.message : "Erro desconhecido ao criar etapa.";
        setError(message);
        toast.error(`Falha ao criar etapa: ${message}`, { id: toastId });
      }
    });
  };

  // Reset form state when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName('');
      setColor('#94a3b8');
      setError(null);
    }
    setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adicionar Nova Etapa</DialogTitle>
          <DialogDescription>
            Defina o nome e a cor para a nova etapa do seu pipeline. A ordem será definida automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stage-name" className="text-right">
                Nome *
              </Label>
              <Input
                id="stage-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder="Ex: Lead Qualificado"
                required
                disabled={isPending}
              />
            </div>
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
                     {/* Use the actual color picker component */}
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
              {isPending ? 'Salvando...' : 'Salvar Etapa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 