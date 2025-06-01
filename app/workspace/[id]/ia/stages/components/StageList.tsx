'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { toast } from 'react-hot-toast';
import { deleteAIStage } from '@/lib/actions/aiStageActions'; // Import the delete action

// Define the type locally for now if not globally available
interface AIStage {
    id: string;
    workspaceId: string;
    name: string;
    condition: string;
    isActive: boolean;
    dataToCollect: any; // Adjust type based on your schema (Json?)
    finalResponseInstruction: string | null;
    createdAt: Date;
    updatedAt: Date;
    // actions: AIStageAction[]; // Add this when handling actions
}

interface StageListProps {
    stages: AIStage[];
    workspaceId: string;
}

export default function StageList({ stages, workspaceId }: StageListProps) {
    const [isPending, startTransition] = useTransition();
    const [openDialog, setOpenDialog] = useState<string | null>(null); // State to control which dialog is open

    const handleDelete = async (stageId: string) => {
        startTransition(async () => {
            const result = await deleteAIStage(stageId);
            if (result.success) {
                toast.success('Estágio excluído com sucesso!');
                // No need to revalidatePath here, as it's handled in the server action
            } else {
                toast.error(`Erro ao excluir estágio: ${result.message}`);
            }
            setOpenDialog(null); // Close dialog after action
        });
    };

    if (stages.length === 0) {
        return <p>Nenhum estágio configurado ainda.</p>;
    }

    return (
        <ul className="space-y-4">
            {stages.map(stage => (
                <li key={stage.id} className="border rounded-md p-4 shadow-sm flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-semibold">{stage.name}</h3>
                        <p className="text-sm text-gray-600">Condição: {stage.condition}</p>
                        <p className="text-xs text-gray-500">Status: {stage.isActive ? 'Ativo' : 'Inativo'}</p>
                    </div>
                    <div className="flex space-x-2">
                        {/* Edit button */}
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/workspace/${workspaceId}/ia/stages/${stage.id}/edit`}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar
                            </Link>
                        </Button>
                        {/* Delete button with AlertDialog */}
                        <AlertDialog open={openDialog === stage.id} onOpenChange={(open) => setOpenDialog(open ? stage.id : null)}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={isPending}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta ação não pode ser desfeita. Isso excluirá permanentemente o estágio "{stage.name}".
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                        onClick={() => handleDelete(stage.id)} 
                                        disabled={isPending}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        {isPending ? 'Excluindo...' : 'Excluir'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </li>
            ))}
        </ul>
    );
}
