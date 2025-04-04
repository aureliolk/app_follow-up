import NextAuth from 'next-auth';
import { authOptions } from '../../../../../../packages/shared-lib/src/auth/auth-options';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };