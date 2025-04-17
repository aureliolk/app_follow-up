// packages/shared-lib/src/auth/auth-options.ts
import { PrismaAdapter } from '@auth/prisma-adapter';
import { compare } from 'bcryptjs';
// <<< CORREÇÃO: Usar alias AuthOptions >>>
import { type NextAuthOptions } from 'next-auth';
// <<< FIM CORREÇÃO >>>
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '../db'; // Usar import relativo

export const authOptions: NextAuthOptions = { // Usa o tipo importado
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout', // Você tem essa página? Senão, remova ou use '/'
    error: '/auth/error', // Você tem essa página? Senão, remova ou use '/'
    newUser: '/auth/register', // Verifique se é necessário ou se o Google já redireciona
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        inviteToken: { label: 'Invite Token', type: 'text' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.password) {
          return null;
        }
        const isValidPassword = await compare(credentials.password, user.password);
        if (!isValidPassword) {
          return null;
        }

        const inviteToken = credentials.inviteToken;
        if (inviteToken) {
          console.log(`[Authorize] Tentando processar inviteToken ${inviteToken} para User ${user.id}`);
          try {
            const invitation = await prisma.workspaceInvitation.findUnique({
              where: { token: inviteToken, status: 'PENDING' },
            });

            if (!invitation) {
              console.warn(`[Authorize] Convite não encontrado ou não pendente para token: ${inviteToken}`);
            } else if (invitation.expires_at < new Date()) {
              console.warn(`[Authorize] Convite expirado para token: ${inviteToken}`);
              await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
            } else {
              console.log(`[Authorize] Convite válido para Workspace ${invitation.workspace_id}. Adicionando membro...`);
              await prisma.workspaceMember.upsert({
                where: { workspace_id_user_id: { workspace_id: invitation.workspace_id, user_id: user.id } },
                update: { role: invitation.role },
                create: { workspace_id: invitation.workspace_id, user_id: user.id, role: invitation.role },
              });
              await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
              console.log(`[Authorize] Usuário ${user.id} adicionado ao workspace ${invitation.workspace_id}. Convite ${invitation.id} aceito.`);
            }
          } catch (inviteError) {
            console.error(`[Authorize] Erro ao processar convite ${inviteToken}:`, inviteError);
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    // Tipagem dos parâmetros agora deve vir do next-auth.d.ts
    async session({ token, session }) {
      // Verifica se session.user existe antes de atribuir
      if (token && session?.user) {
        session.user.id = token.id as string;
        session.user.isSuperAdmin = token.isSuperAdmin as boolean;
        // name, email, image já devem vir da DefaultSession
      }
      return session;
    },
    // Tipagem dos parâmetros agora deve vir do next-auth.d.ts
    async jwt({ token, user, account, profile }) { // Adiciona account e profile se precisar deles
        const userEmail = token.email;

        if (!userEmail) {
             console.warn("JWT Callback: Token sem email.");
             return token; // Retorna token original se não houver email
        }

        // Busca no DB apenas se necessário (ex: na primeira vez ou para refrescar dados)
        // O token já deve ter os dados das chamadas anteriores se configurado corretamente
        if (!token.id || !token.hasOwnProperty('isSuperAdmin')) { // Busca se falta ID ou isSuperAdmin
             console.log(`JWT Callback: Buscando dados no DB para ${userEmail}`);
            const dbUser = await prisma.user.findUnique({
                where: { email: userEmail },
                select: { id: true, name: true, email: true, image: true, is_super_admin: true }
            });

            if (dbUser) {
                token.id = dbUser.id;
                token.name = dbUser.name;
                token.picture = dbUser.image; // JWT usa 'picture' por padrão
                token.isSuperAdmin = dbUser.is_super_admin;
            } else {
                // Usuário não encontrado no DB, mas pode ser fluxo inicial de OAuth
                if (user?.id) {
                     console.warn(`JWT Callback: User ${userEmail} não encontrado no DB, usando ID do objeto 'user' inicial: ${user.id}`);
                     token.id = user.id;
                     // Tenta pegar superAdmin do objeto 'user' (improvável) ou define como false
                     token.isSuperAdmin = (user as any).isSuperAdmin ?? false;
                } else {
                     // Sem usuário no DB e sem objeto 'user' inicial, remove dados potencialmente inválidos
                     console.error(`JWT Callback: User ${userEmail} não encontrado no DB e sem dados iniciais.`);
                     token.id = undefined;
                }
            }
        }
      return token;
    },
  },
};