'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils'; // Importar cn se necessário para classes condicionais

interface WebhookInfoDisplayProps {
  webhookUrl: string | null;
  verifyToken: string | null;
}

export default function WebhookInfoDisplay({ webhookUrl, verifyToken }: WebhookInfoDisplayProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const copyToClipboard = (text: string | null, type: 'url' | 'token') => {
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      if (type === 'url') {
        setCopiedUrl(true);
        toast.success('URL do Webhook copiada!');
        setTimeout(() => setCopiedUrl(false), 2000); // Reset after 2 seconds
      } else {
        setCopiedToken(true);
        toast.success('Token de Verificação copiado!');
        setTimeout(() => setCopiedToken(false), 2000); // Reset after 2 seconds
      }
    }, (err) => {
      console.error('Erro ao copiar:', err);
      toast.error('Falha ao copiar para a área de transferência.');
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium">URL de Callback:</span>
        {webhookUrl ? (
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs truncate flex-1">
              {webhookUrl}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(webhookUrl, 'url')}
              aria-label="Copiar URL do Webhook"
            >
              {copiedUrl ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <span className="text-sm text-orange-600 dark:text-orange-400">
            Salve as configurações primeiro para gerar a URL.
          </span>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium">Token de Verificação:</span>
        {verifyToken ? (
           <div className="flex items-center space-x-2 flex-1 min-w-0">
             <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs truncate flex-1">
               {verifyToken}
             </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(verifyToken, 'token')}
                aria-label="Copiar Token de Verificação"
              >
                {copiedToken ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
        ) : (
           <span className="text-sm text-orange-600 dark:text-orange-400">
            [Será gerado/mostrado após salvar]
          </span>
        )}
      </div>
       <p className="text-xs text-muted-foreground pt-1">Assine pelo menos o evento 'messages' nos campos do webhook na plataforma Meta.</p>
    </div>
  );
} 