// app/auth/login/page.tsx
'use client';

import { useState, Suspense, useEffect } from 'react'; // Adicionado useEffect
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
// Importar LoadingSpinner
import LoadingSpinner from '@/components/ui/LoadingSpinner';
// Importar componentes Shadcn UI (se usados no projeto antigo, se não, manter inputs normais)
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label"; // Shadcn label (opcional, mas bom para consistência)
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"; // Usar Card para estrutura

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/workspaces';
  const { data: session, status } = useSession(); // Pegar status

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- Efeito para redirecionar se já estiver logado ---
  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [status, router, callbackUrl]);
  // --- Fim do Efeito ---

  // Handler não muda
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        setError('Email ou senha inválidos');
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch (error) {
      setError('Ocorreu um erro. Por favor, tente novamente.');
      setIsLoading(false);
    }
  };

  // Handler Google não muda
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn('google', { callbackUrl });
    } catch (error) {
      setError('Ocorreu um erro ao fazer login com o Google.');
      setIsLoading(false);
    }
  };

  // Não renderizar nada enquanto verifica a sessão ou se já está autenticado
  if (status === 'loading' || status === 'authenticated') {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <LoadingSpinner message="Verificando sessão..." />
        </div>
    );
  }

  return (
    // Usa bg-background
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Usa Card */}
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          {/* Usa text-card-foreground */}
          <CardTitle className="text-2xl font-bold text-card-foreground">Entrar</CardTitle>
          {/* Usa text-muted-foreground */}
          <CardDescription className="text-muted-foreground">
            Entre na sua conta para continuar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            // Usa cores destructive
            <div className="bg-destructive/10 text-destructive p-3 border border-destructive/30 rounded-md text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              {/* Usa Label (opcional) e text-foreground */}
              <Label htmlFor="email" className="text-foreground">
                Endereço de email
              </Label>
              {/* Usa Input */}
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
              />
            </div>

            <div className="space-y-1.5">
               <Label htmlFor="password" className="text-foreground">
                Senha
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
              />
            </div>

            <div>
              {/* Usa Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full" // variant="default" é aplicado automaticamente
              >
                {isLoading ? (
                  <LoadingSpinner size="small" message="" />
                ) : (
                  'Entrar'
                )}
              </Button>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
               {/* Usa border-border */}
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
               {/* Usa bg-card e text-muted-foreground */}
              <span className="px-2 bg-card text-muted-foreground">
                Ou continue com
              </span>
            </div>
          </div>

          <div>
             {/* Usa Button com variant="outline" */}
            <Button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              variant="outline"
              className="w-full"
            >
              <svg className="h-4 w-4 mr-2" /* ... (svg google) ... */ >
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"></path><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"></path><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"></path><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"></path></g>
              </svg>
              Google
            </Button>
          </div>
        </CardContent>
        <CardFooter className="text-center block">
           {/* Usa text-muted-foreground e text-primary */}
          <p className="text-sm text-muted-foreground">
            Não possui uma conta?{' '}
            <Link
              href="/auth/register"
              className="font-medium text-primary hover:text-primary/90"
            >
              Cadastre-se
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

// Suspense wrapper não muda
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner message="Carregando página de login..." />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}