import React from 'react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { 
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { PlusCircle, Edit } from 'lucide-react';
import DeleteToolButton from './components/DeleteToolButton';

interface ToolsPageProps {
    params: Promise<{ id: string }>; // <<< params é uma Promise
}

export default async function CustomToolsPage({ params }: ToolsPageProps) {
    // <<< Usar await para resolver a Promise >>>
    const { id: workspaceId } = await params;

    // 1. Buscar as ferramentas customizadas para este workspace
    let tools = [];
    try {
        tools = await prisma.customHttpTool.findMany({
            where: { workspaceId: workspaceId },
            orderBy: { createdAt: 'desc' },
        });
    } catch (error) {
        console.error("[ToolsPage] Error fetching custom tools:", error);
        // TODO: Handle error display in UI
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Ferramentas HTTP Customizadas</h1>
                {/* TODO: Link to a dedicated create page or open a modal */}
                <Button asChild>
                   <Link href={`/workspace/${workspaceId}/ia/tools/new`}> {/* Example link */}                       <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Ferramenta
                   </Link>
                </Button>
            </div>
            
            <p className="text-muted-foreground">
                Configure ferramentas que a IA pode usar para interagir com APIs externas via requisições HTTP.
            </p>

            {/* 2. Listar as ferramentas em uma tabela */}
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>URL</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tools.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    Nenhuma ferramenta customizada encontrada.
                                </TableCell>
                            </TableRow>
                        )}
                        {tools.map((tool) => (
                            <TableRow key={tool.id}>
                                <TableCell className="font-medium">{tool.name}</TableCell>
                                <TableCell><Badge variant="secondary">{tool.method}</Badge></TableCell>
                                <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{tool.url}</TableCell>
                                <TableCell>
                                    <Badge variant={tool.isEnabled ? 'default' : 'outline'}>
                                        {tool.isEnabled ? 'Habilitada' : 'Desabilitada'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-1">
                                    {/* TODO: Link to edit page or open edit modal */}
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link href={`/workspace/${workspaceId}/ia/tools/${tool.id}/edit`}> {/* Example link */}
                                            <Edit className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                    <DeleteToolButton toolId={tool.id} toolName={tool.name} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
} 