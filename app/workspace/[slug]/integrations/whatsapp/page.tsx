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
  const appBaseUrl = process.env.NEXTAUTH_URL || 'https://app.lumibot.com.br'; // Usar URL real ou variável de ambiente
  // Construir URL dinâmica do webhook (USANDO "webhooks" no plural)
  const webhookUrl = settings.whatsappWebhookRouteToken
    ? `${appBaseUrl}/api/webhooks/ingress/whatsapp/${settings.whatsappWebhookRouteToken}`
    : null; // Será null se o token ainda não foi gerado

  return (
    // Aplicar padding e espaçamento padrão
    <div className="p-4 md:p-6 space-y-8"> 
      {/* Título principal da página */}
      <h1 className="text-2xl font-bold text-foreground">
        Integração WhatsApp Cloud API
      </h1>

      {/* Alert de Atenção */}
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Atenção: Informações Sensíveis</AlertTitle>
        <AlertDescription>
          A configuração desta integração requer Tokens de Acesso e Segredos do Aplicativo Meta, que são dados extremamente sensíveis. Certifique-se de obtê-los de forma segura da sua conta Meta e guarde-os com cuidado. Nossa plataforma armazenará essas credenciais de forma segura.
        </AlertDescription>
      </Alert>

      {/* Card para Informações do Webhook */}
      <Card className="border-border bg-card shadow rounded-lg">
        <CardHeader>
          <CardTitle className="text-card-foreground text-lg font-semibold">Configuração do Webhook</CardTitle>
          <CardDescription>
            Use as seguintes informações ao configurar o Webhook dentro do seu Aplicativo Meta (na seção WhatsApp &gt; Configuração da API):
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* O componente WebhookInfoDisplay renderiza a UI específica */}
          <WebhookInfoDisplay
            webhookUrl={webhookUrl}
            verifyToken={settings.webhookVerifyToken}
          />
        </CardContent>
      </Card>

      {/* Card para o Formulário de Configuração da API */}
      <Card className="border-border bg-card shadow rounded-lg">
        <CardHeader>
          <CardTitle className="text-card-foreground text-lg font-semibold">Configuração da API</CardTitle>
          <CardDescription>
            Preencha as informações obtidas do seu Aplicativo e Conta na plataforma Meta Developers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* O componente WhatsappSettingsForm contém os campos do formulário */}
          <WhatsappSettingsForm currentSettings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
