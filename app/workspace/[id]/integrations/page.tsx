// app/workspace/[slug]/settings/integrations/whatsapp/page.tsx
import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WhatsappIntegrationPage from './whatsapp/page';
import EvolutionIntegrationPage from './evolution/page';
import { decrypt } from '@/lib';

interface WhatsappIntegrationPageProps {
  params: {
    id: string;
  };
}


async function getWorkspaceWhatsappSettings(id: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessAccountId: true,
      whatsappAccessToken: true,
      whatsappAppSecret: true,
      whatsappWebhookVerifyToken: true,
      whatsappWebhookRouteToken: true,
      evolution_api_endpoint: true,
      evolution_api_key: true,
      evolution_api_instance_name: true
    },
  });

  if (!workspace) {
    return null;
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    phoneNumberId: workspace.whatsappPhoneNumberId || '',
    businessAccountId: workspace.whatsappBusinessAccountId || '',
    webhookVerifyToken: workspace.whatsappWebhookVerifyToken || '',
    whatsappWebhookRouteToken: workspace.whatsappWebhookRouteToken || null,
    isAccessTokenSet: !!workspace.whatsappAccessToken,
    isAppSecretSet: !!workspace.whatsappAppSecret,
    evolutionApiEndpoint: workspace.evolution_api_endpoint || '',
    evolutionApiInstanceName: workspace.evolution_api_instance_name || '',
    isEvolutionApiKeySet: !!workspace.evolution_api_key,
  };
}

export default async function IntegrationsPage({ params }: WhatsappIntegrationPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  const settings = await getWorkspaceWhatsappSettings((await params).id);



  if (!settings) {
    notFound();
  }

  const appBaseUrl = process.env.NEXTAUTH_URL;
  const webhookUrl = settings.whatsappWebhookRouteToken
    ? `${appBaseUrl}/api/webhooks/ingress/whatsapp/${settings.whatsappWebhookRouteToken}`
    : null;

  return (
    <div className="p-4 md:p-6 space-y-8">
      <Tabs defaultValue="whatsapp">
        <TabsList>
          <TabsTrigger value="whatsapp">API WhatsApp Oficial</TabsTrigger>
          <TabsTrigger value="apievolution">API Evolution (Não Oficial)</TabsTrigger>
        </TabsList>
        <TabsContent value="whatsapp">
          <WhatsappIntegrationPage webhookUrl={webhookUrl} verifyToken={settings.webhookVerifyToken} settings={settings} />
        </TabsContent>

        <TabsContent value="apievolution">
          <EvolutionIntegrationPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
