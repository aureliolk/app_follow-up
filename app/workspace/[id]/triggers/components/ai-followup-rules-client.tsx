'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Edit, Loader2, PlusCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Define the type for a rule, converting delay back to string for display if needed
// Match the structure returned by the API (after serialization)
interface AiFollowUpRule {
    id: string;
    workspace_id: string;
    delay_milliseconds: string; // Serialized from BigInt
    message_content: string;
    created_at: string | Date; // API might return string, Date for initial
    updated_at: string | Date;
}

interface AiFollowUpRulesClientProps {
    initialRules: AiFollowUpRule[];
    workspaceId: string;
}

// Helper to format delay (consider moving to lib/timeUtils)
function formatDelay(msString: string): string {
    try {
        const ms = BigInt(msString);
        if (ms < 60000n) return `${ms / 1000n}s`;
        if (ms < 3600000n) return `${ms / 60000n}m`;
        if (ms < 86400000n) return `${ms / 3600000n}h`;
        return `${ms / 86400000n}d`;
    } catch (e) {
        return 'Inválido';
    }
}

export default function AiFollowUpRulesClient({ initialRules, workspaceId }: AiFollowUpRulesClientProps) {
    const [rules, setRules] = useState<AiFollowUpRule[]>(initialRules);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false); // For general loading/fetching

    // TODO: Add state and handlers for create/edit modal

    const handleDelete = async (ruleId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta regra?')) {
            return;
        }
        setDeletingId(ruleId);
        try {
            const response = await fetch(`/api/workspaces/${workspaceId}/ai-followups/${ruleId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao excluir regra');
            }

            setRules(prevRules => prevRules.filter(rule => rule.id !== ruleId));
            toast.success('Regra excluída com sucesso!');

        } catch (error: any) {
            console.error("Error deleting rule:", error);
            toast.error(`Erro ao excluir regra: ${error.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    // Placeholder for edit function
    const handleEdit = (rule: AiFollowUpRule) => {
        // TODO: Open edit modal with rule data
        console.log("Edit rule:", rule);
        toast('Funcionalidade de edição ainda não implementada.');
    };
     // Placeholder for create function
    const handleCreate = () => {
        // TODO: Open create modal
        console.log("Create new rule");
        toast('Funcionalidade de criação ainda não implementada.');
    };

    return (
        <div className="space-y-4">
             <div className="flex justify-end">
                 <Button onClick={handleCreate}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Nova Regra
                </Button>
             </div>
            {loading ? (
                <p>Carregando regras...</p>
            ) : rules.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Nenhuma regra de acompanhamento definida.</p>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Atraso Inatividade</TableHead>
                                <TableHead>Mensagem</TableHead>
                                <TableHead>Criada em</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rules.map((rule) => (
                                <TableRow key={rule.id}>
                                    <TableCell>{formatDelay(rule.delay_milliseconds)}</TableCell>
                                    <TableCell className="max-w-md truncate">{rule.message_content}</TableCell>
                                    <TableCell>{format(new Date(rule.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleEdit(rule)}
                                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                title="Editar"
                                                disabled={!!deletingId}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(rule.id)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                title="Excluir"
                                                disabled={deletingId === rule.id}
                                            >
                                                {deletingId === rule.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
} 