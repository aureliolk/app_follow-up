// app/workspace/[slug]/settings/page.tsx
'use client';
import { useState } from 'react'; // <<< Adicionar useState
import { useWorkspace } from '@/context/workspace-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApiTokenManager from './components/ApiTokenManager';
import LumibotSettingsForm from './components/LumibotSettingsForm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import IngressWebhookDisplay from './components/IngressWebhookDisplay';
import AISettingsForm from './components/AISettingsForm';

export default function WorkspaceSettingsPage() {
  const { workspace, isLoading } = useWorkspace();
  const [activeTab, setActiveTab] = useState('general'); // <<< ESTADO PARA ABA ATIVA

  // Definição das instruções movida para cá para limpeza
  const lumibotInstructions = (
    <>
        <p><strong>Como usar esta URL na Lumibot/Chatwoot:</strong></p>
        <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Acesse as configurações do seu Inbox (Caixa de Entrada) no Chatwoot.</li>
            <li>Vá para a seção "Configurações" {">"} "Webhooks".</li>
            <li>Clique em "Adicionar novo webhook".</li>
            <li>Cole a URL acima no campo "URL do Webhook".</li>
            <li>Marque os eventos que deseja receber (essencialmente "Mensagem criada" - `message_created`).</li>
            <li>Salve o webhook.</li>
        </ol>
        <p className="mt-2">As mensagens recebidas neste inbox serão agora encaminhadas para este workspace.</p>
    </>
);

  if (isLoading && !workspace) { // Melhor condição de loading inicial
    return <LoadingSpinner message="Carregando configurações..." />;
  }

  if (!workspace) {
    // Se não está carregando e não tem workspace, mostra erro
    return <ErrorMessage message="Workspace não encontrado ou acesso negado." />;
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6 text-foreground">Configurações do Workspace: {workspace.name}</h1>

      {/* <<< Controlar o valor e a mudança da aba >>> */}
      <Tabs
        value={activeTab} // Controlado pelo estado
        onValueChange={setActiveTab} // Atualiza o estado quando a aba muda
        className="w-full"
       >
        <TabsList className="mb-8 grid w-full grid-cols-2 md:grid-cols-5 bg-card border border-border"> {/* Ajustado grid-cols para 5 */}
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="ai">IA</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
        </TabsList>

        {/* Conteúdo das Abas (sem alterações aqui) */}
        <TabsContent value="general" className="space-y-6">
           <Card className="border-border bg-card">
             <CardHeader>
                <CardTitle className="text-card-foreground">Informações Gerais</CardTitle>
             </CardHeader>
             <CardContent className="grid gap-4">
                {/* Campos Nome, Slug, Data Criação */}
                 <div>
                  <Label htmlFor="wsName" className="block text-sm font-medium text-muted-foreground mb-1">Nome do Workspace</Label>
                  <Input id="wsName" type="text" value={workspace.name} disabled className="bg-input border-input text-foreground" />
                 </div>
                 <div>
                   <Label htmlFor="wsSlug" className="block text-sm font-medium text-muted-foreground mb-1">Slug</Label>
                   <Input id="wsSlug" type="text" value={workspace.slug} disabled className="bg-input border-input text-foreground" />
                 </div>
                 <div>
                   <Label htmlFor="wsCreatedAt" className="block text-sm font-medium text-muted-foreground mb-1">Data de Criação</Label>
                   <Input id="wsCreatedAt" type="text" value={new Date(workspace.created_at).toLocaleString('pt-BR')} disabled className="bg-input border-input text-foreground" />
                 </div>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <AISettingsForm />
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <ApiTokenManager workspaceId={workspace.id} />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
           <LumibotSettingsForm />
           <IngressWebhookDisplay
             channelName="Lumibot / Chatwoot"
             pathSegment="lumibot"
             instructions={lumibotInstructions}
           />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
           <Card className="border-border bg-card">
             <CardHeader>
               <CardTitle className="text-card-foreground">Configurações de Notificações</CardTitle>
                <CardDescription>
                  Configure como e quando você deseja receber notificações.
                </CardDescription>
             </CardHeader>
             <CardContent>
                <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded-md">
                 Em breve...
                </div>
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}