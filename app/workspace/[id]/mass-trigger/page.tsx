// app/workspace/[slug]/campaigns/new/page.tsx
import { prisma } from '@/lib/db'; // Ajuste o caminho se necessário
import { notFound, redirect } from 'next/navigation';
import TriggerForm from './components/TriggerForm'; // Importa o formulário
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Usando Shadcn para layout
import { getServerSession } from 'next-auth/next'; // Importar getServerSession
import { authOptions } from '@/lib/auth/auth-options'; // Importar authOptions
import CampaignList from './components/CampaignList'; // Importar o componente CampaignList

export default async function NewCampaignPage({ params }: any) {
  const session = await getServerSession(authOptions); // Obter sessão
  if (!session?.user?.id) {
    // Usuário não logado, redirecionar para login talvez?
    redirect('/login'); // Ou outra página apropriada
  }

  // <<< Correção: Desestruturar ID diretamente do await params >>>
  const { id: workspaceId } = await params;
  // console.log("DEBUG: workspaceId extraído:", workspaceId);

  // Se o ID ainda for undefined/null, não podemos continuar
  if (!workspaceId) {
    console.error("ERRO: Workspace ID não encontrado nos parâmetros da URL para Mass Trigger.");
    notFound();
  }

  // <<< BUSCAR WORKSPACE PELO ID (usando id diretamente) >>>
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId,
    },
    select: {
      id: true, // Selecionar apenas o ID
    },
  });

  // Se workspace não encontrado
  if (!workspace) {
    notFound();
  }
  // <<< FIM BUSCAR WORKSPACE >>>

  // <<< Buscar as campanhas existentes para este workspace >>>
  const campaigns = await prisma.campaign.findMany({
    where: {
      workspaceId: workspaceId,
    },
    orderBy: {
      createdAt: 'desc', // Mostrar as mais recentes primeiro
    },
    // TODO: Selecionar apenas os campos necessários para a lista
    // select: { id: true, name: true, status: true, templateName: true, createdAt: true }
  });

  return (
    <div className="p-4 md:p-6 space-y-8"> {/* Adicionado space-y */}
       <Card >
         <CardHeader>
           <CardTitle>Criar Nova Campanha de Disparo</CardTitle>
           <CardDescription>
             Configure os detalhes da sua campanha para o workspace.
           </CardDescription>
         </CardHeader>
         <CardContent>
           {/* Passando o ID (UUID) real do workspace encontrado pelo slug */}
           <TriggerForm workspaceId={workspace.id} />
         </CardContent>
       </Card>

       {/* <<< Lista de Campanhas Criadas >>> */}
       <h2 className="text-xl font-semibold mt-10 mb-4">Campanhas Criadas</h2>
       {/* <<< Importar e Renderizar CampaignList >>> */}
       <CampaignList campaigns={campaigns} />
    </div>
  );
}