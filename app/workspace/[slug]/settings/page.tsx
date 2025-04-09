// app/workspace/[slug]/settings/page.tsx
'use client';
import { useState, Suspense } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ApiTokenManager from './components/ApiTokenManager';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IngressWebhookDisplay from './components/IngressWebhookDisplay';

export default function WorkspaceSettingsPage() {
  const { workspace, isLoading } = useWorkspace();
  const [activeTab, setActiveTab] = useState('general');

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

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
       >
        <TabsList className="mb-8 grid w-full grid-cols-2 md:grid-cols-5 bg-card border border-border"> {/* Ajustado grid-cols para 5 */}
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          {/* <<< Membros pode precisar de lógica separada ou permissão >>> */}
          {/* <TabsTrigger value="members">Membros</TabsTrigger> */}
        </TabsList>

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

        <TabsContent value="api" className="space-y-6">
          <ApiTokenManager workspaceId={workspace.id} />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
           {/* <<< Adicionar aqui as configurações de integração WhatsApp >>> */}
           {/* (Isso provavelmente precisará de um novo componente) */}
           <Card className="border-border bg-card">
             <CardHeader>
               <CardTitle className="text-card-foreground">Integração WhatsApp</CardTitle>
                <CardDescription>
                  Configure a conexão com a API Cloud do WhatsApp.
                </CardDescription>
             </CardHeader>
             <CardContent>
                 {/* Aqui entraria o formulário/componente para WhatsApp */}
                 <div className="bg-blue-900/20 border border-blue-700 text-blue-200 p-4 rounded-md">
                   Configuração da Integração WhatsApp (Em breve... ou carregar componente existente).
                 </div>
             </CardContent>
           </Card>

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

        {/* ... Aba Members (se for mantida) ... */}
        {/*
        <TabsContent value="members" className="space-y-6">
           {/* <MemberList workspace={workspace} /> */}
        {/* </TabsContent>
        */}
      </Tabs>
    </div>
  );
}