'use client';
import { use } from "react";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'react-hot-toast';

export default function WhatsAppBulkForm({ params }: { params: Promise<{ id: string }> }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [interval, setInterval] = useState(2000); // ms
  const [loading, setLoading] = useState(false);
  const { id } = use(params);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !message) {
      toast.error('Preencha todos os campos!');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('message', message);
    formData.append('intervalMs', interval.toString());
    formData.append('workspaceId',id);
    // Adicione outros campos se necessário

    const res = await fetch('/api/whatsapp-bulk', {
      method: 'POST',
      body: formData,
    });

    setLoading(false);
    if (res.ok) {
      toast.success('Disparo iniciado com sucesso!');
    } else {
      toast.error('Erro ao iniciar disparo.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <Input
        type="file"
        accept=".csv"
        onChange={e => setFile(e.target.files?.[0] || null)}
      />
      <Textarea
        placeholder="Mensagem (use {{nome}} para personalizar)"
        value={message}
        onChange={e => setMessage(e.target.value)}
      />
      <Input
        type="number"
        min={100}
        step={100}
        value={interval}
        onChange={e => setInterval(Number(e.target.value))}
        placeholder="Intervalo entre disparos (ms)"
      />
      <Button type="submit" disabled={loading}>
        {loading ? 'Enviando...' : 'Iniciar Disparo'}
      </Button>
    </form>
  );
}