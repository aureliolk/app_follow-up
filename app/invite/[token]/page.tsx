import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import InviteAcceptanceForm from './components/InviteAcceptanceForm';

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

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
            {/* Exibe a mensagem de status inicial */}
            {!isValid ? message : `Você foi convidado para "${workspaceName}". Verifique seu email abaixo.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isValid && (
            <div className="flex items-center justify-center text-destructive">
              <AlertTriangle className="h-6 w-6 mr-2" />
              <span>{message}</span>
            </div>
          )}
          
          {/* <<< Renderizar o formulário se o convite for válido >>> */} 
          {isValid && invitation && (
            <InviteAcceptanceForm 
              token={token} 
              initialEmail={invitation.email}
              workspaceName={workspaceName}
              role={invitation.role}
            />
          )}

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