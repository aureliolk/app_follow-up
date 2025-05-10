// app/workspace/[slug]/settings/integrations/whatsapp/page.tsx
import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import WhatsappSettingsForm from '../components/WhatsappSettingsForm';
import WebhookInfoDisplay from '../components/WebhookInfoDisplay';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GoogleIntegrationsCard from '../components/GoogleIntegrationsCard';

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
            active_whatsapp_integration_type: true,
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
        activeIntegration: workspace.active_whatsapp_integration_type,
        evolutionApiEndpoint: workspace.evolution_api_endpoint || '',
        evolutionApiInstanceName: workspace.evolution_api_instance_name || '',
        isEvolutionApiKeySet: !!workspace.evolution_api_key,
    };
}

export default async function WhatsappIntegrationPage({ params }: WhatsappIntegrationPageProps) {
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
            <h1 className="text-2xl font-bold text-foreground">
                Integração WhatsApp (Cloud API)
            </h1>

            <div className="space-y-6 mt-4">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Atenção: Informações Sensíveis</AlertTitle>
                    <AlertDescription>
                        A configuração desta integração requer Tokens de Acesso e Segredos do Aplicativo Meta. Certifique-se de obtê-los de forma segura e guarde-os com cuidado.
                    </AlertDescription>
                </Alert>

                <Card className="border-border bg-card shadow-md rounded-xl">
                    <CardHeader>
                        <CardTitle className="text-card-foreground text-lg font-semibold">Configuração do Webhook</CardTitle>
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
                        <CardTitle className="text-card-foreground text-lg font-semibold">Configuração da API</CardTitle>
                        <CardDescription>
                            Preencha as informações obtidas do seu Aplicativo e Conta na plataforma Meta Developers.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <WhatsappSettingsForm currentSettings={settings} />
                    </CardContent>
                </Card>
                <div>
                    <GoogleIntegrationsCard />
                </div>
            </div>
        </div>
    );
}
