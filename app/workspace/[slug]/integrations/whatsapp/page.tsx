// app/workspace/[slug]/settings/integrations/whatsapp/page.tsx
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import WhatsappSettingsForm from './components/WhatsappSettingsForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import WebhookInfoDisplay from './components/WebhookInfoDisplay';

interface WhatsappIntegrationPageProps {
  params: {
    slug: string;
  };
}

// TODO: Implementar descriptografia segura se os tokens/segredos forem criptografados no DB
async function getWorkspaceWhatsappSettings(slug: string) {
    const workspace = await prisma.workspace.findUnique({
        where: { slug },
        select: {
            id: true,
            name: true,
            whatsappPhoneNumberId: true,
            whatsappBusinessAccountId: true,
            whatsappAccessToken: true, // !! Idealmente, não envie o token real para o cliente !!
            whatsappAppSecret: true, // !! NUNCA envie o segredo real para o cliente !! Field might cause lint error if client types aren't updated.
            whatsappWebhookVerifyToken: true,
            whatsappWebhookRouteToken: true, // Buscar o token da rota
        },
    });

    if (!workspace) {
        notFound();
    }

    // NÃO ENVIE SEGREDOS REAIS PARA O CLIENT-SIDE FORM!
    // Retorne apenas os IDs e um indicativo se os segredos estão preenchidos.
    return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        phoneNumberId: workspace.whatsappPhoneNumberId || '',
        businessAccountId: workspace.whatsappBusinessAccountId || '',
        webhookVerifyToken: workspace.whatsappWebhookVerifyToken || '',
        whatsappWebhookRouteToken: workspace.whatsappWebhookRouteToken || null, // Adicionar o token da rota (pode ser null)
        // Apenas indicativos, nunca os valores reais
        isAccessTokenSet: !!workspace.whatsappAccessToken,
        isAppSecretSet: !!workspace.whatsappAppSecret, // Field might cause lint error if client types aren't updated.
    };
}

export default async function WhatsappIntegrationPage({ params }: WhatsappIntegrationPageProps) {
  const settings = await getWorkspaceWhatsappSettings((await params).slug);
  // Construir URL base corretamente (você pode ter isso em .env)
  const appBaseUrl = process.env.NEXTAUTH_URL || 'https://SUA_URL_BASE'; 
  // Construir URL dinâmica do webhook (USANDO "webhooks" no plural)
  const webhookUrl = settings.whatsappWebhookRouteToken 
    ? `${appBaseUrl}/api/webhooks/ingress/whatsapp/${settings.whatsappWebhookRouteToken}`
    : null; // Será null se o token ainda não foi gerado

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Integração WhatsApp Cloud API</h3>
        <p className="text-sm text-muted-foreground">
          Conecte sua Conta Oficial do WhatsApp Business (WABA) para enviar e receber mensagens.
        </p>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Atenção: Informações Sensíveis</AlertTitle>
        <AlertDescription>
          A configuração desta integração requer Tokens de Acesso e Segredos do Aplicativo Meta, que são dados extremamente sensíveis. Certifique-se de obtê-los de forma segura da sua conta Meta e guarde-os com cuidado. Nossa plataforma armazenará essas credenciais de forma segura.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Configuração da API</CardTitle>
          <CardDescription>
            Preencha as informações obtidas do seu Aplicativo e Conta na plataforma Meta Developers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 border rounded-md bg-muted/50">
             <h4 className="font-semibold mb-2">Informações do Webhook</h4>
             <p className="text-sm text-muted-foreground mb-2">
               Use as seguintes informações ao configurar o Webhook dentro do seu Aplicativo Meta (na seção WhatsApp &gt; Configuração da API):
             </p>
             <WebhookInfoDisplay 
               webhookUrl={webhookUrl} 
               verifyToken={settings.webhookVerifyToken}
             />
          </div>
          <WhatsappSettingsForm currentSettings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
