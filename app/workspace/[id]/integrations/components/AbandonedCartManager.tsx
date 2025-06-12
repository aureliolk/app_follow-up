// app/workspace/[id]/integrations/components/AbandonedCartManager.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {  useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/context/workspace-context";
import { UpdateNuvemShopIntegration } from "@/lib/actions/workspaceSettingsActions";



export function AbandonedCartManager() {
  const workspaceContext = useWorkspace();

  const [storeId, setStoreId] = useState(workspaceContext.workspace?.nuvemshopStoreId || '');
  const [token, setToken] = useState(workspaceContext.workspace?.nuvemshopApiKey || '');
  const [isProcessing, setIsProcessing] = useState(false);


  const handleSetIntegrationNuvemShop = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsProcessing(true);
    
    const restul =  await UpdateNuvemShopIntegration({
      store_id: storeId,
      token: token,
      workspaceId: workspaceContext.workspace?.id || '',
    });
    console.log('Resultado da atualização:', restul);

    setIsProcessing(false);
  }

  return (
    <Card className="border-border bg-card shadow-md rounded-xl">
      <CardHeader>
        <CardTitle className="text-card-foreground text-lg font-semibold">Configuração da API NuvemShop</CardTitle>
        <CardDescription>
          Preencha as informações obtidas da sua loja NuvemShop.
        </CardDescription>
      </CardHeader>
      <CardContent>
       <form onSubmit={handleSetIntegrationNuvemShop} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="storeId">StoreId ou AppID</Label>
          <Input
            id="storeId"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="Adicione o StoreId ou AppID da sua loja"
            required
            disabled={isProcessing}
          />
          <p className="text-[0.8rem] text-muted-foreground">Encontrado na Configuração da NuvemShop.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="token">Token de Acesso NuvemShop</Label>
          <Input
            id="businessAccountId"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Add o token de acesso da sua loja"
            required
            disabled={isProcessing}
          />
           <p className="text-[0.8rem] text-muted-foreground">O ID da sua conta comercial principal.</p>
        </div>
         
         
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isProcessing}>
          {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </form>
      </CardContent>
    </Card>
  );
}