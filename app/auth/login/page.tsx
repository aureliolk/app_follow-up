// app/auth/login/page.tsx
'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

type Step = 'checkEmail' | 'signIn' | 'signUp';

// Componente filho que contém a lógica real e o uso de useSearchParams
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams(); // useSearchParams está seguro aqui
  const supabase = createClient();
  const inviteToken = searchParams.get('inviteToken');
  const initialEmail = searchParams.get('email') || '';

  const [step, setStep] = useState<Step>('checkEmail');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/workspaces');
      }
    };
    checkSession();
  }, [router, supabase.auth]); // Adicionar supabase.auth à dependência

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Verifica se o email existe na tabela users do Supabase Auth (forma mais segura)
      // Precisamos de uma função RPC ou uma API route para isso, pois não podemos consultar users diretamente do client-side.
      // Por agora, vamos simplificar e assumir que qualquer email não existente vai para signUp
      // Em produção, implemente uma verificação segura no backend.
      
      // Simulação placeholder (REMOVA E SUBSTITUA POR CHAMADA DE BACKEND SEGURA)
      const { error: lookupError } = await supabase.rpc('check_user_exists', { user_email: email });
      
      if (lookupError && lookupError.code === 'PGRST116') { // Exemplo: Erro padrão se a função não encontra (Resource Not Found)
        console.log("Email não encontrado, redirecionando para cadastro.");
        setStep('signUp');
      } else if (lookupError) {
        throw new Error(lookupError.message || "Erro ao verificar email."); // Outros erros da RPC
      } else {
         console.log("Email encontrado, redirecionando para login.");
        setStep('signIn'); // Email existe
      }

    } catch (err: any) {
      setError('Erro ao verificar email. Tente novamente.');
      console.error('Check email error:', err);
      // Não mudar o step em caso de erro real
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Redirecionamento tratado pelo useEffect agora
      // toast.success('Login bem-sucedido!'); 
      // router.push('/workspaces'); // useEffect cuidará disso

    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login. Verifique suas credenciais.');
      console.error('Sign in error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
       const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name, // Nome é passado aqui
          },
          // Passa o inviteToken se existir para a função de backend (via hook ou trigger)
          ...(inviteToken && { invite_token: inviteToken })
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error("Falha ao criar usuário, tente novamente.");

      toast.success('Conta criada! Verifique seu email para confirmar.');
      // Permanece no formulário de login ou redireciona para aguardar confirmação?
      // Por agora, vamos para o passo de login:
      setStep('signIn'); 

    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta. Tente novamente.');
      console.error('Sign up error:', err);
    } finally {
      setLoading(false);
    }
  };

  // O JSX do formulário permanece o mesmo...
  return (
    <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Coluna da Esquerda (Imagem/Branding) */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <img width={30} height={30} src="https://app.lumibot.com.br/brand-assets/thumbnail-lumibot.svg" alt="Logo lumibot" />
          <span className="ml-2">LumibotAI</span>
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "O LumibotAI revolucionou a forma como nos comunicamos com nossos clientes. É simplesmente incrível!"
            </p>
            <footer className="text-sm">Sofia Oliveira</footer>
          </blockquote>
        </div>
      </div>
      {/* Coluna da Direita (Formulário) */}
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {step === 'checkEmail' && 'Bem-vindo'}
              {step === 'signIn' && 'Faça login na sua conta'}
              {step === 'signUp' && 'Crie sua conta'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === 'checkEmail' && 'Digite seu email para começar'}
              {step === 'signIn' && 'Email: ' + email}
              {step === 'signUp' && 'Preencha para criar sua conta'}
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/15 text-destructive text-sm">
              {error}
            </div>
          )}

          {step === 'checkEmail' && (
            <form onSubmit={handleCheckEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? 'Verificando...' : 'Continuar'}
              </Button>
            </form>
          )}

          {step === 'signIn' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !password}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full text-sm text-muted-foreground h-auto py-1 px-0 font-normal"
                onClick={() => setStep('checkEmail')}
                disabled={loading}
              >
                Usar outro email
              </Button>
            </form>
          )}

          {step === 'signUp' && (
            <form onSubmit={handleSignUp} className="space-y-4">
               <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Crie uma senha segura"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !name || !password}>
                {loading ? 'Criando conta...' : 'Criar conta'}
              </Button>
               <Button
                type="button"
                variant="link"
                className="w-full text-sm text-muted-foreground h-auto py-1 px-0 font-normal"
                onClick={() => setStep('checkEmail')}
                disabled={loading}
              >
                Usar outro email
              </Button>
            </form>
          )}
          
           <p className="px-8 text-center text-sm text-muted-foreground">
              Ao clicar em continuar, você concorda com nossos{" "}
              <Link
                href="/terms"
                className="underline underline-offset-4 hover:text-primary"
              >
                Termos de Serviço
              </Link>{" "}
              e{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-4 hover:text-primary"
              >
                Política de Privacidade
              </Link>
              .
            </p>
        </div>
      </div>
    </div>
  );
}

// Componente pai que envolve o filho com Suspense
export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<div>Carregando...</div>}> {/* Ou um spinner, ou null */}
      <LoginForm />
    </Suspense>
  );
}