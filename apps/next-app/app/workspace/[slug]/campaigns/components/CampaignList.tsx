// app/workspace/[slug]/campaigns/components/CampaignList.tsx
'use client';

// Removido useEffect e useCallback se não forem mais necessários
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/apps/next-app/components/ui/table";
import { Button } from "@/apps/next-app/components/ui/button";
import { Badge } from "@/apps/next-app/components/ui/badge";
import { Edit, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useFollowUp } from '@/apps/next-app/context/follow-up-context'; // Import useFollowUp Hook
import LoadingSpinner from '@/apps/next-app/components/ui/LoadingSpinner';
import ErrorMessage from '@/apps/next-app/components/ui/ErrorMessage';
import type { Campaign } from '@/apps/next-app/app/types';

interface CampaignListProps {
  onEdit: (campaign: Campaign) => void;
  onDelete: (campaignId: string) => void;
  deletingId: string | null;
  // Não precisa mais receber `campaigns` via props se usar contexto
}

export default function CampaignList({ onEdit, onDelete, deletingId }: CampaignListProps) {
  // Acessa o estado diretamente do contexto
  const { campaigns, loadingCampaigns, campaignsError } = useFollowUp();

  // Log para depuração do estado recebido pelo componente
  console.log("CampaignList Render: Loading:", loadingCampaigns, "Error:", campaignsError, "Count:", campaigns?.length ?? 0);

  // --- REMOVIDO O useEffect que chamava fetchCampaigns ---

  // Lógica de renderização baseada no estado do contexto
  if (loadingCampaigns) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg">
        <LoadingSpinner message="Carregando campanhas..." />
      </div>
    );
  }

  if (campaignsError) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg">
        <ErrorMessage message={`Erro ao carregar campanhas: ${campaignsError}`} />
      </div>
    );
  }

  // Verifica se a lista está vazia *depois* de verificar loading e erro
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg">
        <p className="text-muted-foreground">Nenhuma campanha encontrada.</p>
        <p className="text-sm text-muted-foreground mt-1">Crie sua primeira campanha clicando no botão "Nova Campanha".</p>
      </div>
    );
  }

  // Renderiza a tabela se houver campanhas e não houver loading/erro
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">Nome</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead>Criada em</TableHead>
            <TableHead className="text-right w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id} className="hover:bg-muted/50">
              <TableCell className="font-medium text-foreground">{campaign.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm truncate max-w-xs">{campaign.description || '-'}</TableCell>
              <TableCell className="text-center">
                 <Badge variant={campaign.active ? "default" : "secondary"} className={campaign.active ? 'bg-green-700/20 text-green-400 border-green-700/40' : 'bg-red-700/20 text-red-400 border-red-700/40'}>
                  {campaign.active ? 'Ativa' : 'Inativa'}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(new Date(campaign.created_at), 'dd/MM/yyyy', { locale: ptBR })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(campaign)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Editar"
                    disabled={!!deletingId}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(campaign.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Excluir"
                    disabled={deletingId === campaign.id}
                  >
                    {deletingId === campaign.id ? (
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
  );
}