'use client';
import { useState } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApiTokenManager from './components/ApiTokenManager';
import WebhookManager from './components/WebhookManager';

export default function WorkspaceSettingsPage() {
  const { workspace, isLoading } = useWorkspace();
  const [activeTab, setActiveTab] = useState("general");
  
  if (isLoading) {
    return <div className="text-center py-10">Carregando...</div>;
  }
  
  if (!workspace) {
    return <div className="text-center py-10">Workspace não encontrado</div>;
  }
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Configurações do Workspace</h1>
      
      <Tabs defaultValue="general" onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="general" className="px-4 py-2">Geral</TabsTrigger>
          <TabsTrigger value="api" className="px-4 py-2">API</TabsTrigger>
          <TabsTrigger value="webhooks" className="px-4 py-2">Webhooks</TabsTrigger>
          <TabsTrigger value="notifications" className="px-4 py-2">Notificações</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-6">
          <div className="bg-[#161616] rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Informações Gerais</h2>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nome do Workspace</label>
                <input 
                  type="text" 
                  value={workspace.name} 
                  disabled 
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Slug</label>
                <input 
                  type="text" 
                  value={workspace.slug} 
                  disabled 
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Data de Criação</label>
                <input 
                  type="text" 
                  value={new Date(workspace.created_at).toLocaleString()} 
                  disabled 
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                />
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="api" className="space-y-6">
          <ApiTokenManager workspaceId={workspace.id} />
        </TabsContent>
        
        <TabsContent value="webhooks" className="space-y-6">
          <WebhookManager workspaceId={workspace.id} />
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-6">
          <div className="bg-[#161616] rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Configurações de Notificações</h2>
            <p className="text-gray-400 mb-4">
              Configure como e quando você deseja receber notificações relacionadas a este workspace.
            </p>
            <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded-md">
              Configurações de notificação estarão disponíveis em breve.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}