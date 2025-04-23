// app/auth/login/page.tsx
'use client';

import { useState, Suspense } from 'react'; // Adicionado useEffect
import { login as signIn, signup } from './components/actions';
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

// <<< Adicionar tipo para o passo >>>
type Step = 'checkEmail' | 'login' | 'register';

function LoginForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('inviteToken');
  const initialEmail = searchParams.get('email') || '';
  const [errorUi, setErrorUi] = useState<any>('');
  // const { data: session, status } = useSession();

  const [step, setStep] = useState<Step>('checkEmail'); // <<< Estado para controlar o passo
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState(''); // <<< Adicionar estado para nome (registro)
  const [confirmPassword, setConfirmPassword] = useState(''); // <<< Adicionar estado para confirmar senha (registro)
  const [isLoading, setIsLoading] = useState(false);

  // <<< Handler para Verificar Email >>>
  const handleCheckEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault(); // Prevenir envio de form se chamado por ele
    setIsLoading(true);
    setErrorUi('');
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Erro ao verificar email');
      }

      if (data.exists) {
        setStep('login');
      } else {
        setStep('register');
      }
    } catch (err: any) {
      setErrorUi(err.message || 'Ocorreu um erro.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler Google não muda
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorUi('handleGoogleSignIn click');
  };

  // Não renderizar nada enquanto verifica a sessão ou se já está autenticado
  if (isLoading) {
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
          {/* Título muda baseado no passo */}
          <CardTitle className="text-2xl font-bold text-card-foreground">
            {step === 'checkEmail' && 'Entrar ou Cadastrar'}
            {step === 'login' && 'Entrar'}
            {step === 'register' && 'Criar sua conta'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === 'checkEmail' && 'Digite seu email para continuar'}
            {step === 'login' && `Bem-vindo(a) de volta! Digite sua senha para ${email}`}
            {step === 'register' && `Quase lá! Complete seus dados para ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {errorUi && (
            // Usa cores destructive
            <div className="bg-destructive/10 text-destructive p-3 border border-destructive/30 rounded-md text-sm">
              {errorUi}
            </div>
          )}

          {/* Formulário condicional baseado no passo */}

          {/* Passo 1: Verificar Email */}
          {step === 'checkEmail' && (
            <form onSubmit={handleCheckEmail} className="space-y-4">
              {/* Input oculto para o token aqui também? Ou só nos forms finais? Só nos finais. */}
              <div className="space-y-1.5">
                <Label htmlFor="email-check" className="text-foreground">
                  Endereço de email
                </Label>
                <Input
                  id="email-check"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu email"
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading || !email} className="w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
              </Button>
            </form>
          )}

          {/* Passo 2: Login */}
          {step === 'login' && (
            <form action={signIn} className="space-y-4">
              {/* <<< Adicionar input oculto para o token >>> */}
              <input type="hidden" name="inviteToken" value={inviteToken || ''} />
              <div className="space-y-1.5">
                <Label htmlFor="email-login" className="text-foreground">
                  Endereço de email
                </Label>
                <Input
                  id="email-login"
                  name="email"
                  type="email"
                  required
                  value={email}
                  disabled // Email não editável aqui
                  className="bg-muted/50"
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
          )}

          {/* Passo 3: Registro */}
          {step === 'register' && (
            <form action={signup} className="space-y-4">
              {/* <<< Adicionar input oculto para o token >>> */}
              <input type="hidden" name="inviteToken" value={inviteToken || ''} />
              <div className="space-y-1.5">
                <Label htmlFor="name-register" className="text-foreground">
                  Nome Completo
                </Label>
                <Input
                  id="name-register"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-register" className="text-foreground">
                  Endereço de email
                </Label>
                <Input
                  id="email-register"
                  name="email"
                  type="email"
                  required
                  value={email} // Manter o email já digitado
                  readOnly // Tornar read-only para evitar mudança
                  className="bg-muted/50 cursor-not-allowed" // Estilo visual de desabilitado
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password-register" className="text-foreground">
                  Senha
                </Label>
                <Input
                  id="password-register"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Crie uma senha (mín. 8 caracteres)"
                  disabled={isLoading}
                />
              </div>
              {/* <<< Adicionar campo Confirmar Senha >>> */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password-register" className="text-foreground">
                  Confirmar Senha
                </Label>
                <Input
                  id="confirm-password-register"
                  name="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua senha"
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading || password.length < 8 || password !== confirmPassword} className="w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Conta'}
              </Button>
            </form>
          )}

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
            {step === 'checkEmail' && (
              <>Não possui uma conta? <Button variant="link" className="p-0 h-auto font-medium" onClick={() => setStep('register')}>Cadastre-se</Button></>
            )}
            {step === 'login' && (
              <>Não possui uma conta? <Button variant="link" className="p-0 h-auto font-medium" onClick={() => setStep('register')}>Cadastre-se</Button></>
            )}
            {step === 'register' && (
              <>Já possui uma conta? <Button variant="link" className="p-0 h-auto font-medium" onClick={() => setStep('login')}>Entrar</Button></>
            )}
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
