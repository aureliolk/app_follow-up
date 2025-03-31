'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// Ícone MessageSquare não está sendo usado, removido para limpeza.
// import { MessageSquare } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();

  // Não mostra footer nas páginas de autenticação
  const isAuthPage = pathname?.startsWith('/auth');
  if (isAuthPage) return null;

  return (
    // Confirmado: Usa bg-background, text-muted-foreground e border-border para tema
    <footer className="py-8 px-4 border-t border-border bg-background text-muted-foreground">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center">
          {/* Logo */}
          <div className="flex items-center mb-4 md:mb-0">
            <img width={30} height={30} src="https://app.lumibot.com.br/brand-assets/thumbnail-lumibot.svg" alt="Logo lumibot" />
             {/* Confirmado: Usa text-foreground para o nome */}
            <span className="text-lg ml-2 font-bold text-foreground">LumibotAI</span>
          </div>
          {/* Links */}
          <div className="flex gap-6">
             {/* Confirmado: Usa text-muted-foreground e hover:text-foreground */}
            <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacidade</Link>
            <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Termos</Link>
            <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contato</Link>
          </div>
        </div>
        {/* Copyright */}
         {/* Confirmado: Usa text-muted-foreground e hover:text-foreground */}
        <div className="mt-8 text-center text-muted-foreground text-xs">
          © {new Date().getFullYear()} <Link href={'https://lumibot.com.br/'} className="hover:text-foreground">LumibotAI</Link>. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}