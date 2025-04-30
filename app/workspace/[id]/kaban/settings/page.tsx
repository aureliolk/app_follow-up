import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPipelineStages } from '@/lib/actions/pipelineActions';
import type { PipelineStageBasic } from '@/lib/types/pipeline';
import { AddStageForm } from './components/AddStageForm';
import { DeleteStageButton } from './components/DeleteStageButton';
import { EditStageForm } from './components/EditStageForm';


// Async component to display the list of stages
async function PipelineStagesList({ workspaceId }: { workspaceId: string }) {
  let stages: PipelineStageBasic[] = [];
  let fetchError: string | null = null;
  try {
    // Fetch and sort stages by order directly here
    stages = (await getPipelineStages(workspaceId)).sort((a, b) => a.order - b.order);
  } catch (error) {
     console.error("[PipelineSettingsPage|PipelineStagesList] Failed to fetch stages:", error);
     fetchError = error instanceof Error ? error.message : "Erro desconhecido ao buscar etapas.";
  }

  return (
     <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle className="text-xl font-semibold">Etapas do Pipeline</CardTitle>
            <CardDescription>Adicione, edite ou remova as etapas do seu funil de vendas.</CardDescription>
          </div>
           <AddStageForm workspaceId={workspaceId}>
             <Button size="sm">Adicionar Etapa</Button>
           </AddStageForm>
        </CardHeader>
        <CardContent>
          {fetchError && (
             <p className="text-destructive text-sm mb-4">Erro ao carregar etapas: {fetchError}</p>
          )}
          {/* Display stages in a table directly */}
           <div className="mb-4 border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Nome</TableHead>
                  <TableHead className="w-[15%]">Cor</TableHead>
                  <TableHead className="text-right w-[30%]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.length === 0 && !fetchError && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      Nenhuma etapa definida ainda.
                    </TableCell>
                  </TableRow>
                )}
                {stages.map((stage) => (
                  <TableRow key={stage.id}>
                    <TableCell className="font-medium">{stage.name}</TableCell>
                    <TableCell>
                      <div 
                        className="w-6 h-6 rounded border border-border"
                        style={{ backgroundColor: stage.color || '#cccccc' }} 
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                       <EditStageForm workspaceId={workspaceId} stage={stage}>
                         <Button variant="ghost" size="sm">
                           Editar
                         </Button>
                       </EditStageForm>
                       <DeleteStageButton 
                         workspaceId={workspaceId} 
                         stageId={stage.id} 
                         stageName={stage.name}
                         size="sm"
                       />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
  );
}

// Placeholder component for automation rules
async function AutomationRulesList({ workspaceId }: { workspaceId: string }) {
   // const rules = await getPipelineRules(workspaceId); // Fetch rules
   const rules: any[] = []; // Mock data

   return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Regras de Automação</CardTitle>
          <CardDescription>Defina ações automáticas quando uma negociação entra ou sai de uma etapa.</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 && <p className="text-muted-foreground mb-4">Nenhuma regra de automação definida.</p>}
          {/* TODO: Display list of rules if they exist */}
          <Button disabled>Adicionar Regra (Em Breve)</Button>
        </CardContent>
      </Card>
   );
}

interface PipelineSettingsPageProps {
  params: { id: string };
}

export default async function PipelineSettingsPage({ params }: PipelineSettingsPageProps) {
  const { id: workspaceId } = await params;
  
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center mb-4">
        <Button variant="outline" size="sm" asChild className="mr-4">
           <Link href={`/workspace/${workspaceId}/kaban`}>
            ← Voltar para Pipeline
           </Link>
        </Button>
        <h1 className="text-3xl font-bold text-foreground">Configurações do Pipeline</h1>
      </div>
      
      <Suspense fallback={<Card><CardHeader><CardTitle>Etapas do Pipeline</CardTitle></CardHeader><CardContent>Carregando etapas...</CardContent></Card>}>
         <PipelineStagesList workspaceId={workspaceId} />
      </Suspense>
      
       {/* Automation Rules Section - Placeholder */}
       <Suspense fallback={<Card><CardHeader><CardTitle>Regras de Automação</CardTitle></CardHeader><CardContent>Carregando regras...</CardContent></Card>}>
         <AutomationRulesList workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
} 