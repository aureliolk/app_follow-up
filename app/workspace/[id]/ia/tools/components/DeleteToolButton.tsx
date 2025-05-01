'use client';

import React, { useState, useTransition } from 'react';
import { Button } from "@/components/ui/button";
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
import { Trash2, Loader2 } from "lucide-react";
import { toast } from 'react-hot-toast';
import { deleteCustomHttpTool } from '@/lib/actions/toolActions'; // Importar a Server Action

interface DeleteToolButtonProps {
    toolId: string;
    toolName: string;
}

export default function DeleteToolButton({ toolId, toolName }: DeleteToolButtonProps) {
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    const handleDelete = () => {
        startTransition(async () => {
            try {
                await deleteCustomHttpTool(toolId);
                toast.success(`Ferramenta "${toolName}" excluída com sucesso!`);
                setIsOpen(false); // Fechar diálogo após sucesso
                // A revalidação do path é feita na Server Action, então a lista deve atualizar
            } catch (error: any) {
                console.error(`Error deleting tool ${toolId}:`, error);
                toast.error(`Falha ao excluir ferramenta: ${error.message}`);
            }
        });
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isPending}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja excluir a ferramenta "{toolName}"? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
} 