// app/workspace/[slug]/integrations/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, Rss, Zap } from "lucide-react"; // Ícones
import WhatsappIntegrationTabContent from "./components/WhatsappIntegrationTabContent"; // Assumindo que moveremos o conteúdo para cá
import GoogleIntegrationsCard from "./components/GoogleIntegrationsCard";
// import GoogleIntegrationsCard from "../ia/components/GoogleIntegrationsCard"; // Remover import não utilizado

interface IntegrationsPageProps {
  params: {
    slug: string;
  };
}

export default async function IntegrationsPage({ params }: IntegrationsPageProps) {
  const { slug } = await params; // Corrigido: Await params

  // TODO: Buscar dados gerais do workspace se necessário para o card do Google ou outros

  return (
    <div className="p-4 md:p-6 space-y-8">
      <h1 className="text-2xl font-bold text-foreground">
        Integrações
      </h1>

      <Alert variant="default" className="bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">
        <Info className="h-4 w-4 !text-blue-800 dark:!text-blue-300" />
        <AlertTitle className="text-blue-900 dark:text-blue-200">Gerencie suas Conexões</AlertTitle>
        <AlertDescription>
          Conecte ferramentas e serviços externos para automatizar tarefas e centralizar informações. Configure webhooks e APIs para integrar seus sistemas.
        </AlertDescription>
      </Alert>

      {/* Placeholder para Webhook Geral - PRECISA DEFINIR O CONTEÚDO */}
      <Card className="border-border bg-card shadow-md rounded-xl">
        <CardHeader>
          <CardTitle className="text-card-foreground text-lg font-semibold flex items-center">
            <Rss className="h-5 w-5 mr-2" /> Configuração de Webhooks
          </CardTitle>
          <CardDescription>
            Configure webhooks para receber notificações de eventos em sistemas externos ou para enviar dados do Lumi para outras plataformas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            (Detalhes sobre configuração de webhooks de entrada/saída aparecerão aqui...)
          </p>
          {/* Exemplo: Poderia ter um botão para adicionar outgoing webhooks */}
        </CardContent>
      </Card>

      {/* Abas para cada Integração */}
      <Tabs defaultValue="whatsapp" className="w-full">
        {/* Ajustar para apenas 1 coluna inicialmente */}
        <TabsList className="grid w-full grid-cols-1 md:w-[200px]">
          <TabsTrigger value="whatsapp">
            <Zap className="h-4 w-4 mr-1.5" /> WhatsApp
          </TabsTrigger>
          {/* Remover TabTrigger do Google Calendar */}
          {/* <TabsTrigger value="google-calendar"> ... </TabsTrigger> */}
        </TabsList>

        {/* Conteúdo da Aba WhatsApp */}
        <TabsContent value="whatsapp" className="mt-6">
          <WhatsappIntegrationTabContent slug={slug} />
        </TabsContent>



      </Tabs>

    
    </div>
  );
}


