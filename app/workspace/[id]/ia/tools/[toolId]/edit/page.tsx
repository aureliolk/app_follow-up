import React from 'react';
import { prisma } from '@/lib/db';
import ToolForm from '../../components/ToolForm'; // Ajustar path relativo
import { notFound } from 'next/navigation'; // Para lidar com ferramenta não encontrada

interface EditToolPageProps {
    params: Promise<{ 
        id: string;     // Workspace ID
        toolId: string; // Tool ID
    }>; // <<< params é uma Promise
}

export default async function EditToolPage({ params }: EditToolPageProps) {
    // <<< Usar await para resolver a Promise >>>
    const { id: workspaceId, toolId } = await params;

    // Buscar os dados da ferramenta para preencher o formulário
    let toolData = null;
    try {
        toolData = await prisma.customHttpTool.findUnique({
            where: {
                id: toolId,
                // Opcional: garantir que a ferramenta pertence ao workspace correto
                workspaceId: workspaceId, 
            },
        });
    } catch (error) {
        console.error(`[EditToolPage] Error fetching tool ${toolId}:`, error);
        // Poderia redirecionar ou mostrar mensagem de erro genérica
    }

    // Se a ferramenta não for encontrada (ou não pertencer ao workspace), retornar 404
    if (!toolData) {
        notFound();
    }

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold mb-6">Editar Ferramenta HTTP</h1>
            {/* Renderiza o formulário, passando dados iniciais e workspaceId */}
            <ToolForm workspaceId={workspaceId} initialData={toolData} />
        </div>
    );
} 