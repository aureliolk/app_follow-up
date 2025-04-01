// app/workspace/[slug]/settings/page.tsx
'use client';
import { useState } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApiTokenManager from '../[slug]/settings/components/ApiTokenManager';
import WebhookManager from '../[slug]/settings/components/WebhookManager';
import LumibotSettingsForm from '../[slug]/settings/components/LumibotSettingsForm'; // <<< IMPORTAR NOVO COMPONENTE
import LoadingSpinner from '@/components/ui/LoadingSpinner'; // Importar se necessário
import ErrorMessage from '@/components/ui/ErrorMessage';   // Importar se necessário
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function WorkspaceSettingsPage() {
  const { workspace, isLoading } = useWorkspace();
  // O estado activeTab não é mais necessário se usarmos defaultValue nas Tabs
  // const [activeTab, setActiveTab] = useState("general");

  if (isLoading) {
    return <LoadingSpinner message="Carregando configurações..." />; // Usar componente de loading
  }

  if (!workspace) {
    return <ErrorMessage message="Workspace não encontrado ou acesso negado." />; // Usar componente de erro
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6 text-foreground">Configurações do Workspace: {workspace.name}</h1>

      <Tabs defaultValue="general" className="w-full">
        {/* Usar bg-card e text-muted-foreground para TabsList */}
        <TabsList className="mb-8 grid w-full grid-cols-3 md:grid-cols-5 bg-card border border-border">
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger> {/* <<< NOVA ABA */}
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Conteúdo da aba Geral (com estilo Shadcn/Card) */}
          <Card className="border-border bg-card">
            <CardHeader>
                <CardTitle className="text-card-foreground">Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
               {/* ... inputs existentes com classes bg-input, border-input ... */}
               <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Nome do Workspace</label>
                  <Input
                    type="text"
                    value={workspace.name}
                    disabled
                    className="bg-input border-input text-foreground"
                  />
                </div>
                {/* ... outros campos ... */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          {/* Passar workspaceId explicitamente ou garantir que o componente use o contexto */}
          <ApiTokenManager workspaceId={workspace.id} />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
           {/* Passar workspaceId explicitamente ou garantir que o componente use o contexto */}
          <WebhookManager workspaceId={workspace.id} />
        </TabsContent>

        {/* <<< NOVO TabsContent PARA INTEGRAÇÕES >>> */}
        <TabsContent value="integrations" className="space-y-6">
           <LumibotSettingsForm /> {/* Renderiza o novo formulário */}
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
           {/* Conteúdo da aba Notificações (com estilo Shadcn/Card) */}
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