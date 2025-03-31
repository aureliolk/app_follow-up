'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession, signOut, SessionContextValue } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { LogOut, UserCircle, Settings, Layers, Menu, X, Loader2, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils'; // Importar cn para classes condicionais

// --- Definição de Tipos Estendidos para NextAuth ---
import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    isSuperAdmin?: boolean;
  }
  interface Session {
    user: User & {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
declare module 'next-auth/jwt' {
    interface JWT {
      id?: string;
      isSuperAdmin?: boolean;
    }
  }
// --- Fim da Definição de Tipos ---

// Hook para gerenciar o tema (Mantido como antes)
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    // Definir 'dark' como padrão se não houver nada salvo ou se for inválido
    const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
    setTheme(initialTheme);
    if (!storedTheme) {
        localStorage.setItem('theme', 'dark'); // Salva o padrão se não existir
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
    console.log("Tema aplicado:", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}
// --- Fim Hook ---


export default function Header() {
  const { data: session, status }: SessionContextValue = useSession();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isLandingPage = pathname === '/';

  useEffect(() => {
    const handleScroll = () => {
      const shouldBeScrolled = !isLandingPage || window.scrollY > 10;
      setIsScrolled(shouldBeScrolled);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname, isLandingPage]);

  useEffect(() => { setIsMobileMenuOpen(false); }, [pathname]);

  const isAuthPage = pathname?.startsWith('/auth');
  if (isAuthPage) return null;

  const isLoadingSession = status === 'loading';

  const headerClasses = cn(
    'fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out',
    isScrolled || !isLandingPage
      ? 'bg-[hsl(var(--header-background))] border-b border-border shadow-sm py-3'
      : 'bg-transparent py-4'
  );

  // Ajustando cores dos links para contraste
  const linkClasses = cn('text-sm font-medium transition-colors', 'text-muted-foreground hover:text-foreground');
  const activeLinkClasses = 'text-primary font-semibold'; // Laranja e negrito para ativo

  return (
    <header className={headerClasses} >
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-14"> {/* Altura fixa */}
          {/* Logo */}
          <Link href={session ? '/workspaces' : '/'} className="flex items-center gap-2 flex-shrink-0">
            <img width={30} height={30} src="https://app.lumibot.com.br/brand-assets/thumbnail-lumibot.svg" alt="Logo lumibot" />
            <span className="text-lg font-bold text-foreground">LumibotAI</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
             

            {isLoadingSession ? (
              // Placeholders
              <div className="flex items-center gap-6">
                 <div className="h-5 w-20 bg-muted rounded animate-pulse"></div>
                 <div className="h-8 w-8 bg-muted rounded-full animate-pulse"></div>
              </div>
            ) : session ? (
              // Navegação Autenticada (Sem mudanças aqui)
              <>
                <Link
                  href="/workspaces"
                  className={cn(
                    linkClasses,
                    (pathname === '/workspaces' || pathname?.startsWith('/workspace/')) && activeLinkClasses
                  )}
                >
                  Workspaces
                </Link>

                {/* Dropdown do Usuário (Sem mudanças aqui)*/}
                <div className="relative group">
                  <button className="flex items-center text-sm text-muted-foreground hover:text-foreground gap-1 p-1 -m-1 rounded-md hover:bg-accent transition-colors">
                    <UserCircle className="h-6 w-6" />
                  </button>
                  <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-md shadow-lg overflow-hidden origin-top-right scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-200 ease-out pointer-events-none group-hover:pointer-events-auto">
                    {/* ... (conteúdo dropdown mantido) ... */}
                     <div className="p-1 space-y-1">
                       <div className="px-3 py-2 border-b border-border">
                        <p className="text-sm font-medium text-foreground truncate">{session.user?.name || 'Usuário'}</p>
                        <p className="text-xs text-muted-foreground truncate">{session.user?.email}</p>
                      </div>
                      {session.user?.isSuperAdmin && (
                        <div className="px-3 pt-2 text-xs font-semibold text-purple-400">
                          Super Admin
                        </div>
                      )}
                      <Link
                        href="/profile" // Ajustar rota
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-popover-foreground hover:bg-accent rounded-md transition-colors"
                      >
                        <Settings className="h-4 w-4" />
                        Configurações
                      </Link>
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-popover-foreground hover:bg-accent rounded-md transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sair
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // --- Navegação Não Autenticada (Landing Page - AJUSTADA) ---
              <>
                <Link href="#features" className={linkClasses}>
                  Recursos
                </Link>
                <Link href="#how-it-works" className={linkClasses}>
                  Como funciona
                </Link>
                {/* Botão Entrar - Estilo Outline Laranja */}
                <Link
                    href="/auth/login"
                    className={cn(
                        linkClasses,
                        // Aplicando estilo de outline com cor primária
                        "border border-primary text-primary px-4 py-1.5 rounded-md hover:bg-primary/10"
                    )}
                >
                  Entrar
                </Link>
                {/* Botão Cadastre-se - Estilo Primário Laranja Sólido */}
                <Link
                  href="/auth/register"
                  className="inline-flex items-center justify-center px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Cadastre-se
                </Link>
              </>
              // --- Fim da Navegação Ajustada ---
            )}
            {/* Botão de Tema */}
            <button
                onClick={toggleTheme}
                className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                aria-label={`Mudar para tema ${theme === 'light' ? 'escuro' : 'claro'}`}
            >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          
          {/* Botão do Menu Mobile (Sem mudanças) */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-foreground p-2 -mr-2"
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Painel do Menu Mobile (Ajuste nos botões não logados) */}
      {isMobileMenuOpen && !isLoadingSession && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-background border-t border-border shadow-lg">
           <div className="px-4 py-4 space-y-2">
             {/* Botão de Tema Mobile (Mantido) */}
             <button
                onClick={toggleTheme}
                className="flex items-center gap-3 w-full text-left py-2 text-foreground hover:text-primary transition-colors"
                aria-label={`Mudar para tema ${theme === 'light' ? 'escuro' : 'claro'}`}
            >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                <span>Mudar para tema {theme === 'light' ? 'Escuro' : 'Claro'}</span>
            </button>
             <hr className="border-border" />

            {/* Restante do menu mobile */}
            {session ? (
              // Menu Logado (Mantido)
              <>
                {/* ... (código mantido) ... */}
                <div className="flex items-center gap-2 pt-2 border-b border-border pb-3 mb-3">
                  <UserCircle className="h-6 w-6 text-foreground" />
                  <div>
                     <p className="text-sm font-medium text-foreground truncate">{session.user?.name}</p>
                     <p className="text-xs text-muted-foreground truncate">{session.user?.email}</p>
                  </div>
                </div>
                 {session.user?.isSuperAdmin && (
                    <div className="px-3 py-1 text-xs font-semibold text-purple-400">
                        Super Admin
                    </div>
                )}
                <Link
                  href="/workspaces"
                  className="flex items-center gap-3 py-2 text-foreground hover:text-primary transition-colors"
                >
                  <Layers className="h-5 w-5" />
                  Workspaces
                </Link>
                <Link
                  href="/profile" // Ajustar rota
                  className="flex items-center gap-3 py-2 text-foreground hover:text-primary transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  Configurações
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="flex items-center gap-3 w-full text-left py-2 text-foreground hover:text-primary transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  Sair
                </button>
              </>
            ) : (
              // --- Menu Não Logado (AJUSTADO) ---
              <>
                <Link href="#features" className="block py-2 text-foreground hover:text-primary transition-colors">
                  Recursos
                </Link>
                <Link href="#how-it-works" className="block py-2 text-foreground hover:text-primary transition-colors">
                  Como funciona
                </Link>
                {/* Botão Entrar - Estilo Outline Laranja */}
                 <Link
                    href="/auth/login"
                    className="block w-full mt-2 text-center px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary/10 transition-colors"
                >
                  Entrar
                </Link>
                {/* Botão Cadastre-se - Estilo Primário Laranja Sólido */}
                <Link
                  href="/auth/register"
                  className="block w-full mt-2 text-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Cadastre-se
                </Link>
              </>
              // --- Fim Menu Não Logado Ajustado ---
            )}
          </div>
        </div>
      )}
    </header>
  );
} 