// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options'; // Verifique se este caminho está correto

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };