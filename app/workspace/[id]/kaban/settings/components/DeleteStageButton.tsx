'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-hot-toast';
import { deletePipelineStage } from '@/lib/actions/pipelineActions';
import { Button } from '@/components/ui/button';
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface DeleteStageButtonProps {
  stageId: string;
  stageName: string;
  workspaceId: string;
  // ClassName to apply to the trigger button
  className?: string;
  // You can optionally pass other Button props if needed, e.g., size
  size?: "default" | "sm" | "lg" | "icon";
}

export function DeleteStageButton({
  stageId,
  stageName,
  workspaceId,
  className,
  size = "sm", // Default size
}: DeleteStageButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const handleDelete = () => {
    startTransition(async () => {
      let toastId: string | undefined;
      try {
        toastId = toast.loading(`Excluindo etapa "${stageName}"...`);
        await deletePipelineStage(stageId, workspaceId);
        toast.success(`Etapa "${stageName}" excluída com sucesso!`, { id: toastId });
        setIsAlertOpen(false); 
      } catch (error) {
        console.error("Failed to delete stage:", error);
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido.";
        toast.error(`Falha ao excluir etapa: ${errorMessage}`, { id: toastId });
      }
    });
  };

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild> 
         <Button 
           variant="ghost" // Typically delete buttons are ghost or destructive
           size={size}
           className={cn("text-destructive hover:bg-destructive/10 hover:text-destructive", className)} // Default destructive styling
           disabled={isPending}
         >
           Excluir
         </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a etapa "<strong>{stageName}</strong>"?
            <br />
            Esta ação não pode ser desfeita. Só é possível excluir etapas vazias (sem negociações).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            // Use standard destructive button styling from Shadcn
            className={cn(Button({ variant: "destructive" }))}
          >
            {isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 