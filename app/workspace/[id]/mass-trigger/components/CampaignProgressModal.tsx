'use client';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ContactStatus = {
  id: string;
  contactInfo: string;
  contactName: string | null;
  status: string;
  sentAt: Date | null;
  error: string | null;
};

interface Props {
  campaignId: string;
}

export default function CampaignProgressModal({ campaignId }: Props) {
  const [contacts, setContacts] = useState<ContactStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    axios
      .get(`/api/campaigns/${campaignId}/contacts`)
      .then(res => {
        if (!mounted) return;
        if (res.data.success) {
          setContacts(res.data.data);
        } else {
          setError(res.data.error || 'Falha ao carregar contatos');
        }
      })
      .catch(err => {
        if (!mounted) return;
        console.error(err);
        setError(err.message || 'Erro na requisição');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [campaignId]);

  const total = contacts.length;
  const sentCount = contacts.filter(c => c.status === 'SENT').length;
  const percent = total > 0 ? Math.round((sentCount / total) * 100) : 0;

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Progresso da Campanha</DialogTitle>
        <DialogDescription>
          {loading ? 'Carregando...' : `${sentCount} de ${total} enviados (${percent}%)`}
        </DialogDescription>
      </DialogHeader>
      <Separator className="my-4" />
      {loading ? (
        <p>Carregando contatos...</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map(c => (
              <TableRow key={c.id}>
                <TableCell>{c.contactName || c.contactInfo}</TableCell>
                <TableCell>
                  <Badge variant={
                    c.status === 'SENT' ? 'default' :
                    c.status === 'FAILED' ? 'destructive' : 'secondary'
                  }>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-destructive">
                  {c.error || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}