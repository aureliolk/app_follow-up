// app/workspace/[slug]/clients/components/ClientList.tsx
'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/apps/next-app/components/ui/table";
import { Button } from "@/apps/next-app/components/ui/button";
import { Badge } from "@/apps/next-app/components/ui/badge"; // Pode ser útil para Canal
import { Edit, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClient } from '@/apps/next-app/context/client-context'; // <<< Usar hook do Cliente
import LoadingSpinner from '@/apps/next-app/components/ui/LoadingSpinner';
import ErrorMessage from '@/apps/next-app/components/ui/ErrorMessage';
import type { Client } from '@/apps/next-app/app/types';

interface ClientListProps {
  onEdit: (client: Client) => void;
  onDelete: (clientId: string) => void;
  deletingId: string | null;
}

export default function ClientList({ onEdit, onDelete, deletingId }: ClientListProps) {
  const { clients, loadingClients, clientsError } = useClient(); // <<< Acessa estado do contexto

  console.log("ClientList Render: Loading:", loadingClients, "Error:", clientsError, "Count:", clients?.length ?? 0);

  if (loadingClients) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg">
        <LoadingSpinner message="Carregando clientes..." />
      </div>
    );
  }

  if (clientsError) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg">
        <ErrorMessage message={`Erro ao carregar clientes: ${clientsError}`} />
      </div>
    );
  }

  if (!clients || clients.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-border rounded-lg">
        <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
        <p className="text-sm text-muted-foreground mt-1">Adicione seu primeiro cliente clicando no botão "Novo Cliente".</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>ID Externo</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="text-right w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id} className="hover:bg-muted/50">
              <TableCell className="font-medium text-foreground">{client.name || '-'}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{client.phone_number || '-'}</TableCell>
               <TableCell className="text-center">
                 {client.channel ? (
                    <Badge variant="secondary" className="text-xs">{client.channel}</Badge>
                 ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                 )}
               </TableCell>
              <TableCell className="text-muted-foreground text-sm">{client.external_id || '-'}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(new Date(client.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(client)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Editar"
                    disabled={!!deletingId}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(client.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Excluir"
                    disabled={deletingId === client.id}
                  >
                    {deletingId === client.id ? (
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