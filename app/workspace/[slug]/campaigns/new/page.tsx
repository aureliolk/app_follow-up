// app/workspace/[slug]/campaigns/new/page.tsx
import { prisma } from '@/lib/db'; // Ajuste o caminho se necessário
import { notFound } from 'next/navigation';
import CampaignForm from './components/CampaignForm'; // Importa o formulário
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Usando Shadcn para layout
import { getServerSession } from 'next-auth/next'; // Importar getServerSession
import { authOptions } from '@/lib/auth/auth-options'; // Importar authOptions

interface NewCampaignPageProps {
  params: {
    slug: string;
  };
}

export default async function NewCampaignPage({ params }: NewCampaignPageProps) {
  const session = await getServerSession(authOptions); // Obter sessão
  if (!session?.user?.id) {
    // Idealmente, redirecionar para login ou mostrar erro não autorizado
    // Por simplicidade aqui, podemos retornar notFound(), mas uma página de erro seria melhor
    notFound();
  }
  const userId = session.user.id; // Obter userId

  const { slug } = params; // Remover await daqui, params não é Promise

  // Buscar dados do workspace pelo slug, verificando pertencimento
  const workspace = await prisma.workspace.findUnique({
    where: {
      slug: slug, // Usar a variável slug
      members: { some: { user_id: userId } }
    },
    select: {
      id: true,
      name: true,
      // REMOVIDO: lumibot_api_token: true,
      // REMOVIDO: lumibot_account_id: true,
    },
  });

  // Se o workspace não for encontrado, retorna 404
  if (!workspace) {
    notFound();
  }

  // REMOVIDO: Verificação de configuração Lumibot
  // const lumibotConfigured = !!workspace.lumibot_api_token && !!workspace.lumibot_account_id;

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
           {/* REMOVIDO: Renderização condicional - sempre mostra o formulário */}
           <CampaignForm
             workspaceId={workspace.id}
             // Passe outras props se necessário
           />
         </CardContent>
       </Card>
    </div>
  );
}
