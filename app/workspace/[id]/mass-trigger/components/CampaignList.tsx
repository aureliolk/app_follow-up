'use client'; // Necessário para interações futuras (delete, etc.) ou formatação de data no cliente

import { Campaign } from '@prisma/client'; // Importar o tipo Campaign
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react'; // Importar useState
import { deleteCampaignAction } from '@/lib/actions/triggerActions'; // Importar a Server Action
import toast from 'react-hot-toast'; // Importar react-hot-toast

interface CampaignListProps {
    campaigns: Campaign[];
}

// Função para mapear status para variantes de Badge
const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | undefined => {
    switch (status) {
        case 'PENDING': return 'outline';
        case 'RUNNING': return 'default';
        case 'PAUSED': return 'secondary';
        case 'COMPLETED': return 'default';
        case 'FAILED': return 'destructive';
        default: return 'secondary';
    }
};

export default function CampaignList({ campaigns }: CampaignListProps) {

    // Estado para rastrear qual campanha está sendo deletada
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (campaignId: string) => {
        // Impedir múltiplos cliques
        if (deletingId) return;

        // Mostrar confirmação (opcional, mas bom para UX)
        if (!confirm('Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.')) {
            return;
        }

        setDeletingId(campaignId); // Iniciar o estado de loading
        const toastId = toast.loading('Excluindo campanha...');

        try {
            const result = await deleteCampaignAction(campaignId);

            if (result.success) {
                toast.success('Campanha excluída com sucesso!', { id: toastId });
                // A revalidação no server action deve atualizar a lista
            } else {
                toast.error(`Falha ao excluir: ${result.error || 'Erro desconhecido'}`, { id: toastId });
            }
        } catch (error) {
            // Captura erros inesperados na chamada da action
            console.error("Erro ao chamar deleteCampaignAction:", error);
            toast.error('Ocorreu um erro inesperado ao tentar excluir.', { id: toastId });
        } finally {
            setDeletingId(null); // Resetar o estado de loading, independentemente do resultado
        }
    };

    return (
        <Table>
            <TableCaption>Lista das suas campanhas de disparo em massa.</TableCaption>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell>{campaign.templateName || '-'}</TableCell>
                        <TableCell>
                            <Badge variant={getStatusVariant(campaign.status)}>{campaign.status}</Badge>
                        </TableCell>
                        <TableCell>
                            {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="mr-2" title="Ver Detalhes (não implementado)">
                                <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive/80"
                                onClick={() => handleDelete(campaign.id)}
                                title="Excluir"
                                // Desabilitar o botão enquanto está deletando esta campanha específica
                                disabled={deletingId === campaign.id}
                            >
                                {deletingId === campaign.id ? (
                                    <span className="animate-spin h-4 w-4 border-t-2 border-current rounded-full" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
} 