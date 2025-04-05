import type { DefaultSession, DefaultUser } from 'next-auth';
import type { JWT as DefaultJWT } from 'next-auth/jwt';

// Extend the User type to include id (optional, if needed beyond session/token)
// interface User extends DefaultUser {
//   id: string;
//   isSuperAdmin?: boolean;
// }

// Extend the Session interface
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isSuperAdmin?: boolean; // Add our custom property
    } & DefaultSession['user']; // Keep existing properties like name, email, image
  }
}

// Extend the JWT interface
declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT { // Keep existing properties like sub, iat, exp
    id?: string | undefined;
    isSuperAdmin?: boolean;
    // Ensure standard claims used in callbacks are also here if not in DefaultJWT
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
} 