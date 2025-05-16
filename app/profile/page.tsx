// app/profile/page.tsx

import { Metadata } from 'next';
import { getServerSession } from 'next-auth/next'; // Importar getServerSession
import { authOptions } from '@/lib/auth/auth-options'; // Importar suas opções de auth
import { prisma } from '@/lib/db'; // Importar prisma para buscar mais dados do usuário se necessário
import { redirect } from 'next/navigation'; // Importar redirect

// Importe os Client Components com os formulários
import ProfileForm from './components/ProfileForm';
import ChangePasswordForm from './components/ChangePasswordForm'; // Importar o novo componente

export const metadata: Metadata = {
  title: "Configurações do Perfil",
  description: "Gerencie as configurações da sua conta de usuário.",
};

export default async function ProfileSettingsPage() {
  // Buscar a sessão do usuário
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    // Redirecionar para login se não houver sessão válida
    redirect('/auth/login'); // Redireciona para a página de login
  }

  // O email do usuário logado
  const userEmail = session.user.email;

  // Buscar dados completos do usuário no banco de dados usando o email
  // Ajuste os campos selecionados conforme o que ProfileForm espera e o que você quer permitir editar/visualizar
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      name: true,
      email: true,
      image: true, // Incluir imagem se ProfileForm for usar/editar
      created_at: true, // Exemplo de outros campos que você pode querer exibir
      updated_at: true,
      // Adicionar outros campos aqui que você quer carregar
    },
  });


  if (!user) {
    // Exibir erro ou redirecionar se o usuário não for encontrado no DB (cenário improvável se a sessão existir)
    // TODO: Decidir se quer redirecionar para erro ou exibir mensagem
     console.error('Erro: Usuário autenticado não encontrado no DB.');
     redirect('/error'); // Exemplo: redirecionar para uma página de erro
  }

  // Passar os dados reais do usuário para o Client Component
  // NOTE: Certifique-se que os campos passados aqui correspondem aos campos esperados na interface ProfileFormProps
  const userForForm = {
    id: user.id,
    name: user.name,
    email: user.email,
    // Passar outros campos aqui se ProfileForm precisar/usar
    image: user.image,
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 md:p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Configurações do Perfil</h1>
      
      {/* Renderiza o Client Component para o formulário de perfil */}
      <ProfileForm user={userForForm} />

      {/* Renderiza o Client Component para o formulário de alteração de senha */}
      <ChangePasswordForm />
    </div>
  );
}

