'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react'; // Using lucide-react for icons
// Assuming AIStage type is available globally or can be imported
// import { AIStage } from '@prisma/client'; // Example import path - verify

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
                         {/* Display active status */}
                        <p className="text-xs text-gray-500">Status: {stage.isActive ? 'Ativo' : 'Inativo'}</p>
                    </div>
                    <div className="flex space-x-2">
                        {/* Edit button */}
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/workspace/${workspaceId}/ia/stages/${stage.id}/edit`}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar
                            </Link>
                        </Button>
                        {/* Delete button - will add functionality later */}
                        <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </Button>
                    </div>
                </li>
            ))}
        </ul>
    );
} 