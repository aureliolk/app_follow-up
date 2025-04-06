// next-auth.d.ts (ou em packages/shared-lib/src/types/next-auth.d.ts)

import 'next-auth';
import 'next-auth/jwt'; // Import para estender o JWT também

// Estende a interface User padrão do NextAuth
declare module 'next-auth' {
  interface User {
    // Adiciona os campos que você usa nos callbacks
    id: string;
    isSuperAdmin?: boolean; // Opcional (?) porque pode não vir sempre do DB no início
  }

  // Estende a interface Session padrão do NextAuth
  interface Session {
    user: User & { // Garante que session.user terá os campos da interface User acima
      // Você pode adicionar outros campos específicos da SESSÃO aqui se necessário,
      // mas geralmente os campos do User são suficientes.
      // Exemplo: accessToken?: string; (se você adicionasse no callback session)
    } & DefaultSession['user']; // Combina com os campos padrões (name, email, image)
  }
}

// Estende a interface JWT padrão do NextAuth
declare module 'next-auth/jwt' {
  interface JWT {
    // Adiciona os campos que você coloca no token no callback jwt
    id?: string; // Opcional (?) porque pode não estar presente inicialmente
    isSuperAdmin?: boolean;
    // Adicione outros campos que você armazena no token, se houver
    // Exemplo: picture?: string | null; (já existe por padrão, mas pode redefinir)
  }
}