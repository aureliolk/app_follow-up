'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from 'react-hot-toast';
import { createDeal } from '@/lib/actions/pipelineActions';
import type { PipelineStageBasic, DealCreateInput, ClientBasic } from '@/lib/types/pipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogClose } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DealFormProps {
  workspaceId: string;
  stages: PipelineStageBasic[];
  clients: ClientBasic[];
  onSuccess?: () => void;
}

export function DealForm({ workspaceId, stages, clients, onSuccess }: DealFormProps) {
  const [name, setName] = React.useState('');
  const [value, setValue] = React.useState<number | undefined>(undefined);
  const [selectedStageId, setSelectedStageId] = React.useState<string>(stages[0]?.id ?? '');
  const [selectedClientId, setSelectedClientId] = React.useState<string>('');
  const [clientComboboxOpen, setClientComboboxOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
      if (!selectedStageId && stages.length > 0) {
          setSelectedStageId(stages[0].id);
      }
  }, [stages, selectedStageId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('O nome da negociação é obrigatório.');
      return;
    }
    if (!selectedStageId) {
        setError('Selecione a etapa inicial.');
        return;
    }
    if (!selectedClientId) {
        setError('Selecione um cliente.');
        return;
    }

    const dealData: DealCreateInput = {
      name: name.trim(),
      stageId: selectedStageId,
      value: value,
      clientId: selectedClientId,
    };

    startTransition(async () => {
      let toastId: string | undefined;
      try {
        toastId = toast.loading('Criando negociação...');
        await createDeal(workspaceId, dealData);
        toast.success('Negociação criada com sucesso!', { id: toastId });
        setName('');
        setValue(undefined);
        setSelectedStageId(stages[0]?.id ?? '');
        setSelectedClientId('');
        setError(null);
        onSuccess?.();
      } catch (err) {
        console.error("Failed to create deal:", err);
        const message = err instanceof Error ? err.message : "Erro desconhecido ao criar negociação.";
        setError(message);
        toast.error(`Falha ao criar negociação: ${message}`, { id: toastId });
      }
    });
  };

  return (
    <form id="deal-form" onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-1">
        <Label htmlFor="deal-name">Nome da Negociação *</Label>
        <Input
          id="deal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Nova Proposta Cliente X"
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="deal-value">Valor Estimado (R$)</Label>
        <Input
          id="deal-value"
          type="number"
          value={value ?? ''}
          onChange={(e) => setValue(e.target.value === '' ? undefined : parseFloat(e.target.value))}
          placeholder="1500.00"
          step="0.01"
          min="0"
          disabled={isPending}
        />
      </div>

      <div className="space-y-1">
          <Label htmlFor="deal-stage">Etapa Inicial *</Label>
          <Select
              value={selectedStageId}
              onValueChange={setSelectedStageId}
              required
              disabled={isPending || stages.length === 0}
          >
              <SelectTrigger id="deal-stage">
                  <SelectValue placeholder="Selecione uma etapa..." />
              </SelectTrigger>
              <SelectContent>
                  {stages.length === 0 && <SelectItem value="-" disabled>Nenhuma etapa disponível</SelectItem>}
                  {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                      </SelectItem>
                  ))}
              </SelectContent>
          </Select>
          {stages.length === 0 && <p className="text-xs text-muted-foreground">Crie etapas nas configurações do Kanban.</p>}
      </div>

      <div className="space-y-1">
        <Label>Cliente *</Label>
        <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={clientComboboxOpen}
              className="w-full justify-between font-normal text-left h-auto min-h-9"
              disabled={isPending || clients.length === 0}
            >
              <span className="truncate">
                {selectedClientId
                  ? clients.find((client) => client.id === selectedClientId)?.name ?? `Cliente ID: ${selectedClientId.substring(0, 6)}...`
                  : "Selecione um cliente..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
            <Command>
              <CommandInput placeholder="Buscar cliente..." />
              <CommandList>
                <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                <CommandGroup>
                  {clients.map((client) => (
                    <CommandItem
                      key={client.id}
                      value={client.name ?? client.id}
                      onSelect={(currentValue) => {
                        const clientId = clients.find(c => 
                          (c.name?.toLowerCase() === currentValue.toLowerCase()) || 
                          (c.id === currentValue)
                        )?.id;
                        setSelectedClientId(clientId ?? "");
                        setClientComboboxOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedClientId === client.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">
                         {client.name ?? `Cliente s/ nome (ID: ${client.id.substring(0, 6)}...)`}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
         {clients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente cadastrado neste workspace.</p>}
      </div>

      {error && <p className="text-sm text-destructive text-center py-2">{error}</p>}

      <div className="flex justify-end gap-2 pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isPending}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending || stages.length === 0 || clients.length === 0 || !selectedStageId || !selectedClientId}>
          {isPending ? 'Criando...' : 'Criar Negociação'}
        </Button>
      </div>
    </form>
  );
} 