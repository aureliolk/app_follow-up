"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authOptions = void 0;
// packages/shared-lib/src/auth/auth-options.ts
const prisma_adapter_1 = require("@auth/prisma-adapter");
const bcryptjs_1 = require("bcryptjs");
// <<< FIM CORREÇÃO >>>
const credentials_1 = __importDefault(require("next-auth/providers/credentials"));
const google_1 = __importDefault(require("next-auth/providers/google"));
const db_1 = require("../db"); // Usar import relativo
exports.authOptions = {
    adapter: (0, prisma_adapter_1.PrismaAdapter)(db_1.prisma),
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
        (0, google_1.default)({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        }),
        (0, credentials_1.default)({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!(credentials === null || credentials === void 0 ? void 0 : credentials.email) || !credentials.password) {
                    return null;
                }
                const user = await db_1.prisma.user.findUnique({
                    where: { email: credentials.email },
                });
                if (!user || !user.password) {
                    return null;
                }
                // Use bcryptjs's compare method here
                const isValidPassword = await (0, bcryptjs_1.compare)(credentials.password, user.password);
                if (!isValidPassword) {
                    return null;
                }
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    // isSuperAdmin não é retornado pelo authorize por padrão
                };
            },
        }),
    ],
    callbacks: {
        // Tipagem dos parâmetros agora deve vir do next-auth.d.ts
        async session({ token, session }) {
            // Verifica se session.user existe antes de atribuir
            if (token && (session === null || session === void 0 ? void 0 : session.user)) {
                session.user.id = token.id;
                session.user.isSuperAdmin = token.isSuperAdmin;
                // name, email, image já devem vir da DefaultSession
            }
            return session;
        },
        // Tipagem dos parâmetros agora deve vir do next-auth.d.ts
        async jwt({ token, user, account, profile }) {
            var _a;
            const userEmail = token.email;
            if (!userEmail) {
                console.warn("JWT Callback: Token sem email.");
                return token; // Retorna token original se não houver email
            }
            // Busca no DB apenas se necessário (ex: na primeira vez ou para refrescar dados)
            // O token já deve ter os dados das chamadas anteriores se configurado corretamente
            if (!token.id || !token.hasOwnProperty('isSuperAdmin')) { // Busca se falta ID ou isSuperAdmin
                console.log(`JWT Callback: Buscando dados no DB para ${userEmail}`);
                const dbUser = await db_1.prisma.user.findUnique({
                    where: { email: userEmail },
                    select: { id: true, name: true, email: true, image: true, is_super_admin: true }
                });
                if (dbUser) {
                    token.id = dbUser.id;
                    token.name = dbUser.name;
                    token.picture = dbUser.image; // JWT usa 'picture' por padrão
                    token.isSuperAdmin = dbUser.is_super_admin;
                }
                else {
                    // Usuário não encontrado no DB, mas pode ser fluxo inicial de OAuth
                    if (user === null || user === void 0 ? void 0 : user.id) {
                        console.warn(`JWT Callback: User ${userEmail} não encontrado no DB, usando ID do objeto 'user' inicial: ${user.id}`);
                        token.id = user.id;
                        // Tenta pegar superAdmin do objeto 'user' (improvável) ou define como false
                        token.isSuperAdmin = (_a = user.isSuperAdmin) !== null && _a !== void 0 ? _a : false;
                    }
                    else {
                        // Sem usuário no DB e sem objeto 'user' inicial, remove dados potencialmente inválidos
                        console.error(`JWT Callback: User ${userEmail} não encontrado no DB e sem dados iniciais.`);
                        delete token.id;
                        delete token.isSuperAdmin;
                    }
                }
            }
            return token;
        },
    },
};
//# sourceMappingURL=auth-options.js.map