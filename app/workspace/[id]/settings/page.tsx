// app/workspace/[slug]/settings/page.tsx
'use client';
// import { useState, Suspense } from 'react';
import { useWorkspace } from '@/context/workspace-context';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ApiTokenManager from './components/ApiTokenManager';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IngressWebhookDisplay from './components/IngressWebhookDisplay';

export default function WorkspaceSettingsPage() {
  const { workspace, isLoading } = useWorkspace();
  // const [activeTab, setActiveTab] = useState('general');


  if (isLoading && !workspace) {
    return <LoadingSpinner message="Carregando configurações..." />;
  }

  if (!workspace) {
    return <ErrorMessage message="Workspace não encontrado ou acesso negado." />;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6 text-foreground">
        Configurações do Workspace: <span className="text-primary">{workspace.name}</span>
      </h1>

      {/* Container principal com espaçamento vertical */}
      <div className="space-y-8">

        {/* Card de Informações Gerais */}
        <Card className="border-border bg-card shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-card-foreground text-lg font-semibold">Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="wsName" className="block text-xs font-medium text-muted-foreground mb-1">
                Nome do Workspace
              </Label>
              <Input
                id="wsName"
                type="text"
                value={workspace.name}
                disabled
                className="bg-input border-input text-foreground text-sm"
              />
            </div>
            <div>
              <Label htmlFor="wsSlug" className="block text-xs font-medium text-muted-foreground mb-1">
                Slug
              </Label>
              <Input
                id="wsSlug"
                type="text"
                value={workspace.slug}
                disabled
                className="bg-input border-input text-foreground text-sm"
              />
            </div>
            <div>
              <Label htmlFor="wsCreatedAt" className="block text-xs font-medium text-muted-foreground mb-1">
                Data de Criação
              </Label>
              <Input
                id="wsCreatedAt"
                type="text"
                value={new Date(workspace.created_at).toLocaleString('pt-BR')}
                disabled
                className="bg-input border-input text-foreground text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Card de Gerenciamento de Tokens de API */}
        {/* O componente ApiTokenManager já renderiza seus próprios Cards internos */}
        <ApiTokenManager workspaceId={workspace.id} />

        {/* Adicionar outros Cards aqui se necessário */}
        {/* Exemplo: Se IngressWebhookDisplay também for um Card independente */}
        {/* <IngressWebhookDisplay workspaceId={workspace.id} /> */}

      </div>
    </div>
  );
}