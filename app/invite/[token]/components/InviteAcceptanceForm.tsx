'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface InviteAcceptanceFormProps {
  token: string;
  initialEmail: string;
  workspaceName: string;
  role: string;
}

type Step = 'checkEmail' | 'login' | 'register';

export default function InviteAcceptanceForm({
  token,
  initialEmail,
  workspaceName,
  role,
}: InviteAcceptanceFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('checkEmail');
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckEmail = async () => {
    setIsLoading(true);
    setError(null);
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
      setError(err.message || 'Ocorreu um erro.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        inviteToken: token, // Passar o token aqui
      });

      if (result?.error) {
        setError('Email ou senha inválidos');
        setIsLoading(false);
        return;
      }
      // Login bem-sucedido (e convite processado no backend), redirecionar
      router.push('/workspaces'); // Ou para o workspace específico?
       router.refresh(); // Forçar refresh para pegar nova sessão/dados
    } catch (err) {
      setError('Ocorreu um erro ao fazer login.');
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      setIsLoading(false);
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres');
      setIsLoading(false);
      return;
    }

    try {
      // 1. Chamar API de registro (que agora processa o token)
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteToken: token }),
      });
      const registerData = await registerRes.json();

      if (!registerRes.ok) {
        throw new Error(registerData.message || 'Falha ao registrar');
      }

      // 2. Se registro OK, fazer login automaticamente
      const loginResult = await signIn('credentials', {
        redirect: false,
        email,
        password,
        // Não precisa mais passar token aqui, já foi processado no registro
      });

       if (loginResult?.error) {
         // Registro funcionou, mas login falhou? Estranho. Redirecionar para login.
         setError('Conta criada, mas erro ao logar automaticamente. Faça login.')
         router.push(`/auth/login?email=${email}`);
         setIsLoading(false);
         return;
      }

      // Registro e login OK, redirecionar
      router.push('/workspaces');
      router.refresh();

    } catch (err: any) {
      setError(err.message || 'Falha ao registrar');
       setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 border border-destructive/30 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Passo 1: Verificar Email */} 
      {step === 'checkEmail' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="email-check" className="text-muted-foreground">Email Convidado</Label>
            <Input
              id="email-check"
              type="email"
              value={email}
              // Permitir edição caso o email esteja errado?
              onChange={(e) => setEmail(e.target.value)}
              // disabled // Ou desabilitar?
              className="mt-1"
              required
            />
          </div>
          <Button onClick={handleCheckEmail} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
          </Button>
        </div>
      )}

      {/* Passo 2: Login */} 
      {step === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="email-login">Email</Label>
            <Input id="email-login" type="email" value={email} disabled className="mt-1 bg-muted/50" />
          </div>
          <div>
            <Label htmlFor="password-login">Senha</Label>
            <Input
              id="password-login"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
              placeholder="Digite sua senha"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Entrar e Aceitar Convite para ${workspaceName}`}
          </Button>
           <Button variant="link" size="sm" onClick={() => setStep('checkEmail')} className="w-full text-muted-foreground">Voltar</Button>
        </form>
      )}

      {/* Passo 3: Registro */} 
      {step === 'register' && (
        <form onSubmit={handleRegister} className="space-y-4">
           <div>
            <Label htmlFor="email-register">Email</Label>
            <Input id="email-register" type="email" value={email} disabled className="mt-1 bg-muted/50" />
          </div>
           <div>
            <Label htmlFor="name-register">Nome Completo</Label>
            <Input
              id="name-register"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1"
              placeholder="Digite seu nome"
            />
          </div>
          <div>
            <Label htmlFor="password-register">Criar Senha</Label>
            <Input
              id="password-register"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword-register">Confirmar Senha</Label>
            <Input
              id="confirmPassword-register"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-1"
              placeholder="Repita a senha"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Criar Conta e Aceitar Convite para ${workspaceName}`}
          </Button>
           <Button variant="link" size="sm" onClick={() => setStep('checkEmail')} className="w-full text-muted-foreground">Voltar</Button>
        </form>
      )}

       <p className="text-xs text-center text-muted-foreground">
         Ao aceitar, você concorda em ser adicionado ao workspace "{workspaceName}" com a função de {role}.
      </p>
    </div>
  );
} 