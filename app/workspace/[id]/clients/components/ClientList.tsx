// app/workspace/[slug]/clients/components/ClientList.tsx
'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Loader2, Users, Smartphone } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClient } from "@/context/client-context";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { Client } from '@/app/types';

interface ClientListProps {
  onEdit: (client: Client) => void;
  onDelete: (clientId: string) => void;
  deletingId: string | null;
  loadMoreClients: () => void;
  hasMoreClients: boolean;
  isLoadingMoreClients: boolean;
}

const getChannelIcon = (channel: string | null | undefined) => {
  switch (channel) {
    case 'WHATSAPP':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p>WhatsApp</p>
          </TooltipContent>
        </Tooltip>
      );
    default:
      return <span className="text-muted-foreground text-xs">-</span>;
  }
};

export default function ClientList({ 
  onEdit, 
  onDelete, 
  deletingId, 
  loadMoreClients,
  hasMoreClients,
  isLoadingMoreClients
}: ClientListProps) {
  const { clients, loadingClients: initialLoading, clientsError } = useClient();
  const observer = useRef<IntersectionObserver | null>(null);
  const lastClientElementRef = useCallback((node: HTMLTableRowElement | null) => {
    if (initialLoading || isLoadingMoreClients) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreClients) {
        loadMoreClients();
      }
    });
    if (node) observer.current.observe(node);
  }, [initialLoading, isLoadingMoreClients, hasMoreClients, loadMoreClients]);

  console.log("ClientList Render: InitialLoading:", initialLoading, "IsLoadingMore:", isLoadingMoreClients, "Error:", clientsError, "Count:", clients?.length ?? 0, "HasMore:", hasMoreClients);

  if (clientsError && clients.length === 0) {
    return (
      <div className="py-10">
        <ErrorMessage message={`Erro ao carregar clientes: ${clientsError}`} />
      </div>
    );
  }

  if (clients.length === 0 && !initialLoading && !isLoadingMoreClients) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground font-medium">Nenhum cliente encontrado.</p>
        <p className="text-sm text-muted-foreground mt-1">
          {clientsError ? clientsError : 'Tente ajustar sua busca ou adicione um novo cliente.'}
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[200px] text-center">Nome</TableHead>
              <TableHead className="text-center">Telefone</TableHead>
              <TableHead className="w-[100px] text-center">Canal</TableHead>
              <TableHead className="text-center">ID Externo</TableHead>
              <TableHead className="text-center">Criado em</TableHead>
              <TableHead className="text-right w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client, index) => {
              if (clients.length === index + 1) {
                return (
                  <TableRow ref={lastClientElementRef} key={client.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground text-center">{client.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm text-center">{client.phone_number || '-'}</TableCell>
                    <TableCell className="text-center flex justify-center items-center">
                      {getChannelIcon(client.channel)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm text-center">{client.external_id || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm text-center">
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
                );
              } else {
                return (
                  <TableRow key={client.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground text-center">{client.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm text-center">{client.phone_number || '-'}</TableCell>
                    <TableCell className="text-center flex justify-center items-center">
                      {getChannelIcon(client.channel)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm text-center">{client.external_id || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm text-center">
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
                );
              }
            })}
          </TableBody>
        </Table>
      </div>
      {isLoadingMoreClients && (
        <div className="flex justify-center items-center py-6">
          <LoadingSpinner message="Carregando mais clientes..." />
        </div>
      )}
      {!isLoadingMoreClients && !hasMoreClients && clients.length > 0 && (
        <div className="text-center text-muted-foreground py-6 text-sm">
          Fim da lista de clientes.
        </div>
      )}
    </TooltipProvider>
  );
}