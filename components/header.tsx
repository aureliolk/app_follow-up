'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, UserCircle, Settings, Menu, X, Sun, Moon } from 'lucide-react';
import { cn } from "@/lib/utils";
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

// Hook para gerenciar o tema
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
    setTheme(initialTheme);
    if (!storedTheme) {
      localStorage.setItem('theme', 'dark');
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
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isLandingPage = pathname === '/';
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  const headerClasses = cn(
    'fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out',
    isScrolled || !isLandingPage
      ? 'bg-[hsl(var(--header-background))] border-b border-border shadow-sm py-3'
      : 'bg-transparent py-4'
  );

  const linkClasses = cn('text-sm font-medium transition-colors', 'text-muted-foreground hover:text-foreground');
  const activeLinkClasses = 'text-primary font-semibold';

  if (pathname?.startsWith('/workspace/')) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className={headerClasses}>
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-14">
          <Link href={user ? '/workspaces' : '/'} className="flex items-center gap-2 flex-shrink-0">
            <img width={30} height={30} src="https://app.lumibot.com.br/brand-assets/thumbnail-lumibot.svg" alt="Logo lumibot" />
            <span className="text-lg font-bold text-foreground">LumibotAI</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {loading ? (
              <div className="flex items-center gap-6">
                <div className="h-5 w-20 bg-muted rounded animate-pulse"></div>
                <div className="h-8 w-8 bg-muted rounded-full animate-pulse"></div>
              </div>
            ) : user ? (
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

                <div className="relative group">
                  <button className="flex items-center text-sm text-muted-foreground hover:text-foreground gap-1 p-1 -m-1 rounded-md hover:bg-accent transition-colors">
                    <UserCircle className="h-6 w-6" />
                  </button>
                  <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-md shadow-lg overflow-hidden origin-top-right scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-200 ease-out pointer-events-none group-hover:pointer-events-auto">
                    <div className="p-1 space-y-1">
                      <div className="px-3 py-2 border-b border-border">
                        <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/account"
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-popover-foreground hover:bg-accent rounded-md transition-colors"
                      >
                        <Settings className="h-4 w-4" />
                        Configurações
                      </Link>
                      <button
                        onClick={handleSignOut}
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
              <>
                <Link href="#features" className={linkClasses}>
                  Recursos
                </Link>
                <Link href="#how-it-works" className={linkClasses}>
                  Como funciona
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    linkClasses,
                    "border border-primary text-primary px-4 py-1.5 rounded-md hover:bg-primary/10"
                  )}
                >
                  Entrar
                </Link>
              </>
            )}

            <button
              onClick={toggleTheme}
              className="p-2 rounded-md hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
} 