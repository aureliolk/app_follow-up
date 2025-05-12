import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import GoogleIntegrationsCard from "../components/GoogleIntegrationsCard";
import WebhookInfoDisplay from "../components/WebhookInfoDisplay";
import WhatsappSettingsForm from "../components/WhatsappSettingsForm";

interface WhatsappIntegrationPageProps {
    webhookUrl: string;
    verifyToken: string;
    settings: any;
}

export default function WhatsappIntegrationPage({ webhookUrl, verifyToken, settings }: WhatsappIntegrationPageProps) {
    
    return (
        <div>
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
                            verifyToken={verifyToken}
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
                <GoogleIntegrationsCard />
            </div>
        </div>
    )
}


