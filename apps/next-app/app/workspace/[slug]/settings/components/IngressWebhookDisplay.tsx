// app/workspace/[slug]/settings/components/IngressWebhookDisplay.tsx
'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/apps/next-app/context/workspace-context';
import { Input } from '@/apps/next-app/components/ui/input';
import { Label } from '@/apps/next-app/components/ui/label';
import { Button } from '@/apps/next-app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/apps/next-app/components/ui/card';
import { Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface IngressWebhookDisplayProps {
    channelName: string; // Ex: "Lumibot / Chatwoot"
    pathSegment: string; // Ex: "lumibot"
    instructions: React.ReactNode; // Instruções específicas do canal
}

export default function IngressWebhookDisplay({ channelName, pathSegment, instructions }: IngressWebhookDisplayProps) {
    const { workspace } = useWorkspace();
    const [webhookUrl, setWebhookUrl] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (workspace?.id && typeof window !== 'undefined') {
            const origin = window.location.origin; // Pega http://localhost:3000 ou https://yourdomain.com
            const url = `${origin}/api/webhooks/ingress/${pathSegment}?workspaceId=${workspace.id}`;
            setWebhookUrl(url);
        }
    }, [workspace, pathSegment]);

    const handleCopy = () => {
        if (!webhookUrl) return;
        navigator.clipboard.writeText(webhookUrl)
            .then(() => {
                setCopied(true);
                toast.success('URL copiada!');
                setTimeout(() => setCopied(false), 2000); // Resetar ícone após 2 segundos
            })
            .catch(err => {
                console.error('Falha ao copiar URL:', err);
                toast.error('Falha ao copiar URL.');
            });
    };

    if (!workspace) {
        return null; // Ou um placeholder de loading/erro
    }

    return (
        <Card className="border-border bg-card mt-6"> {/* Adiciona margem superior */}
            <CardHeader>
                <CardTitle className="text-card-foreground">Webhook de Entrada - {channelName}</CardTitle>
                <CardDescription>
                    Use esta URL para configurar o envio de mensagens recebidas do {channelName} para este workspace.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor={`webhook-url-${pathSegment}`} className="text-foreground">
                        URL do Webhook
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id={`webhook-url-${pathSegment}`}
                            type="text"
                            value={webhookUrl}
                            readOnly
                            className="bg-input border-input text-foreground font-mono flex-grow"
                            placeholder="Gerando URL..."
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            disabled={!webhookUrl}
                            aria-label="Copiar URL"
                        >
                            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
                 <div className="text-sm text-muted-foreground space-y-2">
                    {instructions}
                 </div>
            </CardContent>
        </Card>
    );
}