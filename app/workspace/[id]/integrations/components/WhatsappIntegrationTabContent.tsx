import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import WhatsappSettingsForm from './WhatsappSettingsForm'; // Ajustar path relativo
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import WebhookInfoDisplay from './WebhookInfoDisplay'; // Ajustar path relativo
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EvolutionApiSettingsForm from './EvolutionApiSettingsForm'; // Ajustar path relativo

// Interface para as props do componente
interface WhatsappIntegrationTabContentProps {
  slug: string;
}

// Função para buscar dados (mantida aqui, mas agora usa slug da prop)
async function getWorkspaceWhatsappSettings(slug: string) {
  const workspace = await prisma.workspace.findUnique({
      where: { slug },
      select: {
          id: true,
          name: true,
          // Campos Cloud API
          whatsappPhoneNumberId: true,
          whatsappBusinessAccountId: true,
          whatsappAccessToken: true, // Não enviar para o cliente!
          whatsappAppSecret: true, // Não enviar para o cliente!
          whatsappWebhookVerifyToken: true,
          whatsappWebhookRouteToken: true,
          // Novos campos Evolution API e tipo ativo
          active_whatsapp_integration_type: true, 
          evolution_api_endpoint: true,
          evolution_api_key: true, // Não enviar para o cliente!
          evolution_api_instance_name: true,
      },
  });

  if (!workspace) {
      notFound();
  }

  return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      // Cloud API
      phoneNumberId: workspace.whatsappPhoneNumberId || '',
      businessAccountId: workspace.whatsappBusinessAccountId || '',
      webhookVerifyToken: workspace.whatsappWebhookVerifyToken || '',
      whatsappWebhookRouteToken: workspace.whatsappWebhookRouteToken || null,
      isAccessTokenSet: !!workspace.whatsappAccessToken,
      isAppSecretSet: !!workspace.whatsappAppSecret,
      // Evolution API e Tipo Ativo
      activeIntegration: workspace.active_whatsapp_integration_type, 
      evolutionApiEndpoint: workspace.evolution_api_endpoint || '',
      evolutionApiInstanceName: workspace.evolution_api_instance_name || '',
      isEvolutionApiKeySet: !!workspace.evolution_api_key, 
  };
}

// O componente agora recebe slug como prop
export default async function WhatsappIntegrationTabContent({ slug }: WhatsappIntegrationTabContentProps) {
  const settings = await getWorkspaceWhatsappSettings(slug); // Usa o slug da prop
  const appBaseUrl = process.env.NEXTAUTH_URL || 'https://app.lumibot.com.br';
  const webhookUrl = settings.whatsappWebhookRouteToken
    ? `${appBaseUrl}/api/webhooks/ingress/whatsapp/${settings.whatsappWebhookRouteToken}`
    : null;

  // O JSX é o mesmo que estava na página antiga, mas agora dentro deste componente
  return (
    // Removemos o padding/margem externa, pois a página pai já tem
    <Tabs defaultValue="cloud-api" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="cloud-api">WhatsApp Cloud API (Oficial)</TabsTrigger>
        <TabsTrigger value="evolution-api">Evolution API (Não Oficial)</TabsTrigger>
      </TabsList>

      <TabsContent value="cloud-api" className="space-y-6 mt-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Atenção: Informações Sensíveis (Cloud API)</AlertTitle>
          <AlertDescription>
            A configuração desta integração requer Tokens de Acesso e Segredos do Aplicativo Meta. Certifique-se de obtê-los de forma segura e guarde-os com cuidado.
          </AlertDescription>
        </Alert>

        <Card className="border-border bg-card shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-card-foreground text-lg font-semibold">Configuração do Webhook (Cloud API)</CardTitle>
            <CardDescription>
              Use as seguintes informações ao configurar o Webhook dentro do seu Aplicativo Meta (WhatsApp &gt; Configuração da API):
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebhookInfoDisplay
              webhookUrl={webhookUrl}
              verifyToken={settings.webhookVerifyToken}
            />
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-card-foreground text-lg font-semibold">Configuração da API (Cloud API)</CardTitle>
            <CardDescription>
              Preencha as informações obtidas do seu Aplicativo e Conta na plataforma Meta Developers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WhatsappSettingsForm currentSettings={settings} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="evolution-api" className="space-y-6 mt-4">
        <Alert variant="default" className="bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300">
          <AlertCircle className="h-4 w-4 !text-yellow-800 dark:!text-yellow-300" />
          <AlertTitle className="text-yellow-900 dark:text-yellow-200">Atenção: API Não Oficial</AlertTitle>
          <AlertDescription>
            A Evolution API não é uma solução oficial do WhatsApp. Seu uso pode apresentar instabilidade e riscos de bloqueio. Use por sua conta e risco.
          </AlertDescription>
        </Alert>
        
        <Card className="border-border bg-card shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-card-foreground text-lg font-semibold">Configuração da Evolution API</CardTitle>
            <CardDescription>
              Preencha as informações da sua instância da Evolution API e selecione a integração ativa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EvolutionApiSettingsForm currentSettings={settings} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
} 