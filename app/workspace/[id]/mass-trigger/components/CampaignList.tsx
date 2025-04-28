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
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import CampaignProgressModal from './CampaignProgressModal';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useEffect } from 'react'; // Importar useState e useEffect
import { deleteCampaignAction } from '@/lib/actions/triggerActions'; // Importar a Server Action
import toast from 'react-hot-toast'; // Importar react-hot-toast

interface CampaignListProps {
    initialCampaigns: Campaign[]; // Renomear para clareza
    workspaceId: string; // << ADICIONAR workspaceId
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

// <<< Função para traduzir status >>>
const translateStatus = (status: string): string => {
    switch (status) {
        case 'PENDING': return 'Pendente';
        case 'RUNNING': return 'Em Execução';
        case 'PAUSED': return 'Pausada';
        case 'COMPLETED': return 'Concluída';
        case 'FAILED': return 'Falhou';
        default: return status; // Retorna o original se não houver tradução
    }
};

export default function CampaignList({ initialCampaigns, workspaceId }: CampaignListProps) {
    // Estado para a lista de campanhas, inicializado com os dados do servidor
    const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // <<< Adicionar useEffect para sincronizar com initialCampaigns >>>
    useEffect(() => {
        setCampaigns(initialCampaigns);
    }, [initialCampaigns]);

    // <<< INÍCIO: Lógica SSE >>>
    useEffect(() => {
        console.log(`[SSE CampaignList] useEffect triggered. workspaceId: ${workspaceId}`); // << Log inicial

        // << Verifica se workspaceId é válido antes de conectar >>
        if (!workspaceId || typeof workspaceId !== 'string') {
            console.log("[SSE CampaignList] Invalid or missing workspaceId. Skipping EventSource setup.");
            return; // Não tenta conectar sem ID válido
        }

        console.log(`[SSE CampaignList] Setting up EventSource for workspace: ${workspaceId}`);
        const eventSource = new EventSource(`/api/sse?workspaceId=${workspaceId}`);

        eventSource.onopen = () => {
            console.log("[SSE CampaignList] Connection opened.");
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("[SSE CampaignList] Message received:", data);

                // Verifica se é uma mensagem de conclusão de campanha
                if (data.type === 'campaignCompleted' && data.campaignId && data.status === 'COMPLETED') {
                    console.log(`[SSE CampaignList] Campaign ${data.campaignId} completed event received.`);
                    // Atualiza o estado local da lista de campanhas
                    setCampaigns((prevCampaigns) =>
                        prevCampaigns.map((campaign) =>
                            campaign.id === data.campaignId
                                ? { ...campaign, status: 'COMPLETED' }
                                : campaign
                        )
                    );
                }
                // TODO: Adicionar lógica para atualizar progresso individual se necessário (usando `data.contactId` e `data.status`)

            } catch (error) {
                console.error("[SSE CampaignList] Error parsing SSE message:", error);
            }
        };

        eventSource.onerror = (error) => {
            // << Log de erro mais detalhado >>
            console.error("[SSE CampaignList] EventSource error occurred:", error);
            // Tentar logar o estado da conexão
            console.log(`[SSE CampaignList] EventSource readyState on error: ${eventSource.readyState}`);
            // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
            eventSource.close(); // Fecha explicitamente em caso de erro
        };

        // Limpeza ao desmontar o componente
        return () => {
            console.log(`[SSE CampaignList] Cleanup: Closing EventSource connection. Current readyState: ${eventSource?.readyState}`);
            eventSource?.close();
        };

    }, [workspaceId]); // Dependência: workspaceId
    // <<< FIM: Lógica SSE >>>

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
                // <<< ATUALIZAR ESTADO LOCAL DIRETAMENTE >>>
                setCampaigns((prevCampaigns) =>
                    prevCampaigns.filter((campaign) => campaign.id !== campaignId)
                );
                // Não precisa mais depender de revalidação/refresh aqui
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
                            <Badge variant={getStatusVariant(campaign.status)}>{translateStatus(campaign.status)}</Badge>
                        </TableCell>
                        <TableCell>
                            {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="mr-2" title="Ver progresso">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Progresso da Campanha</DialogTitle>
                                  <DialogDescription>Detalhes de envio por contato.</DialogDescription>
                                </DialogHeader>
                                <CampaignProgressModal campaignId={campaign.id} />
                              </DialogContent>
                            </Dialog>
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