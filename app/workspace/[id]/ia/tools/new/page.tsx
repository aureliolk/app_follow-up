import React from 'react';
import ToolForm from '../components/ToolForm'; // Componente do formulário (a ser criado)

interface NewToolPageProps {
    params: Promise<{ id: string }>; // <<< params é uma Promise
}

export default async function NewToolPage({ params }: NewToolPageProps) {
    // <<< Usar await para resolver a Promise >>>
    const { id: workspaceId } = await params;

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold mb-6">Adicionar Nova Ferramenta HTTP</h1>
            {/* Renderiza o formulário, passando o workspaceId e indicando que é para criar (não editar) */}
            <ToolForm workspaceId={workspaceId} />
        </div>
    );
} 