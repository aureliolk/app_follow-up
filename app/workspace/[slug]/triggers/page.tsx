// app/workspace/[slug]/campaigns/new/page.tsx
import { prisma } from '@/lib/db'; // Ajuste o caminho se necessário
import { notFound } from 'next/navigation';
import TriggerForm from './components/TriggerForm'; // Importa o formulário
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
    notFound();
  }
  

  return (
    <div className="p-4 md:p-6">
       <Card >
         <CardHeader>
           <CardTitle>Criar Nova Campanha de Disparo</CardTitle>
           <CardDescription>
             Configure os detalhes da sua campanha para o workspace.
           </CardDescription>
         </CardHeader>
         <CardContent>
           <TriggerForm />
         </CardContent>
       </Card>
    </div>
  );
}