import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import { Button } from '@/components/ui/button'; // Usaremos botões Shadcn
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = params;

  if (!token) {
    notFound(); // Se não houver token, página não encontrada
  }

  // 1. Buscar o convite pelo token
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: {
      token: token,
    },
    include: {
      workspace: {
        select: { name: true, id: true }, // Incluir nome e ID do workspace
      },
    },
  });

  // 2. Validar o convite
  let isValid = false;
  let message = 'Convite inválido ou expirado.';
  let workspaceName = '';

  if (invitation) {
    workspaceName = invitation.workspace.name;
    if (invitation.status === 'PENDING') {
      if (invitation.expires_at > new Date()) {
        isValid = true;
        message = `Você foi convidado para participar do workspace "${workspaceName}".`;
      } else {
        message = `Este convite para o workspace "${workspaceName}" expirou.`;
        // Opcional: Atualizar status para EXPIRED no banco?
        // await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      }
    } else if (invitation.status === 'ACCEPTED') {
      message = `Este convite para "${workspaceName}" já foi aceito.`;
      // Talvez redirecionar para o login ou dashboard?
      // redirect('/login'); 
    } else {
      // Status REVOKED ou outros?
      message = `Este convite para "${workspaceName}" não está mais ativo.`;
    }
  } else {
    message = 'Convite não encontrado.';
  }

  // 3. Renderizar UI baseada na validação
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-foreground">
            Convite para Workspace
          </CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            {message} {/* Exibe a mensagem de status */}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isValid && (
            <div className="flex items-center justify-center text-destructive">
              <AlertTriangle className="h-6 w-6 mr-2" />
              <span>{message}</span> {/* Repete a mensagem para clareza */} 
            </div>
          )}
          
          {isValid && invitation && (
            <>
              <p className="text-center text-muted-foreground">
                Para aceitar o convite e entrar em "{workspaceName}", faça login ou crie uma nova conta.
              </p>
              <div className="flex flex-col space-y-4">
                {/* TODO: Implementar fluxo de login/cadastro aqui */}
                {/* O ideal é que estes botões levem para páginas de login/cadastro 
                    passando o token na URL ou em estado para ser processado após autenticação */}
                <Button 
                  asChild 
                  className="w-full"
                >
                  {/* Passar href para o Link, que é filho do Button asChild */} 
                  <Link href={`/auth/login?inviteToken=${token}&email=${invitation.email}`}>
                    Fazer Login para Aceitar
                  </Link>
                </Button>
                <Button 
                  asChild 
                  variant="outline" 
                  className="w-full"
                >
                   {/* Passar href para o Link, que é filho do Button asChild */} 
                   <Link href={`/auth/register?inviteToken=${token}&email=${invitation.email}`}>
                     Criar Conta para Aceitar
                   </Link>
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Ao aceitar, você concorda em ser adicionado ao workspace "{workspaceName}" com a função de {invitation.role}.
              </p>
            </>
          )}

          {/* Link para voltar para a página inicial ou login genérico */} 
          {!isValid && (
             <div className="text-center mt-6">
                <Link href="/" className="text-sm text-primary hover:text-primary/80">
                  Voltar para a página inicial
                </Link>
             </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
} 