// app/workspace/[slug]/campaigns/new/page.tsx
import { prisma } from '@/lib/db'; // Ajuste o caminho se necessário
import { notFound } from 'next/navigation';
import CampaignForm from './components/CampaignForm'; // Importa o formulário
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Usando Shadcn para layout

interface NewCampaignPageProps {
  params: {
    slug: string;
  };
}

export default async function NewCampaignPage({ params }: NewCampaignPageProps) {
  const { slug } = await params;

  // Buscar dados do workspace pelo slug
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      // Inclua outros campos se necessário, ex: lumibot_api_token, lumibot_account_id
      // É importante buscar aqui apenas o necessário para passar ao formulário
      lumibot_api_token: true,
      lumibot_account_id: true,
    },
  });

  // Se o workspace não for encontrado, retorna 404
  if (!workspace) {
    notFound();
  }

  // Verificar se as credenciais Lumibot estão presentes, se forem essenciais
  const lumibotConfigured = !!workspace.lumibot_api_token && !!workspace.lumibot_account_id;

  return (
    <div className="container mx-auto py-10">
       <Card className="max-w-4xl mx-auto">
         <CardHeader>
           <CardTitle>Criar Nova Campanha de Disparo</CardTitle>
           <CardDescription>
             Configure os detalhes da sua campanha para o workspace '{workspace.name}'.
           </CardDescription>
         </CardHeader>
         <CardContent>
           {lumibotConfigured ? (
             <CampaignForm
               workspaceId={workspace.id}
               // Passe outras props se necessário, como o token (se for usar no client-side, CUIDADO)
             />
           ) : (
             <div className="text-center text-red-600 bg-red-100 p-4 rounded-md">
               <p className="font-semibold">Configuração Incompleta!</p>
               <p>As credenciais da API Lumibot (ID da Conta e Token) precisam ser configuradas nas configurações deste workspace antes de criar campanhas.</p>
               {/* Adicionar link para as configurações do workspace se possível */}
             </div>
           )}
         </CardContent>
       </Card>
    </div>
  );
}
