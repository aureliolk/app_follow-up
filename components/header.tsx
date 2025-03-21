'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { LogOut, UserCircle, Settings, Home, Layers, MessageSquare, Menu, X } from 'lucide-react';

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when path changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const isAuthPage = pathname?.startsWith('/auth');
  const isLandingPage = pathname === '/';

  // Don't show header on auth pages
  if (isAuthPage) return null;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isScrolled || !isLandingPage ? 'bg-[#0a0a0a] shadow-md py-2' : 'bg-transparent py-4'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href={session ? '/workspaces' : '/'} className="flex items-center">
            {/* <div className="h-10 w-10 bg-[#F54900] rounded-md flex items-center justify-center mr-2">
              <MessageSquare className="h-6 w-6 text-white" />
            </div> */}
            <img width={35} height={35} src="https://app.lumibot.com.br/brand-assets/thumbnail-lumibot.svg" alt="Logo lumibot" />
            <span className="text-xl ml-2 font-bold text-white">LumibotAI</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {session ? (
              // Authenticated navigation
              <>
                <Link
                  href="/workspaces"
                  className={`text-sm ${
                    pathname === '/workspaces' ? 'text-white' : 'text-gray-400 hover:text-white'
                  } transition-colors`}
                >
                  Workspaces
                </Link>
                
                {/* User dropdown */}
                <div className="relative group">
                  <button className="flex items-center text-gray-400 hover:text-white gap-2">
                    <UserCircle className="h-5 w-5" />
                    <span>{session.user?.name || session.user?.email}</span>
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-[#111111] border border-[#333333] rounded-md shadow-lg overflow-hidden origin-top-right scale-0 group-hover:scale-100 transition-transform">
                    <div className="p-2">
                      {session.user?.isSuperAdmin && (
                        <div className="px-3 py-2 text-xs text-purple-400 border-b border-[#333333] mb-1">
                          Super Admin
                        </div>
                      )}
                      <Link
                        href="/profile"
                        className="block px-3 py-2 text-sm text-gray-300 hover:bg-[#222222] rounded-md"
                      >
                        <Settings className="h-4 w-4 inline mr-2" />
                        Configurações
                      </Link>
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#222222] rounded-md"
                      >
                        <LogOut className="h-4 w-4 inline mr-2" />
                        Sair
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // Unauthenticated navigation for landing page
              <>
                <Link
                  href="#features"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Recursos
                </Link>
                <Link
                  href="#how-it-works"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Como funciona
                </Link>
                <Link
                  href="/auth/login"
                  className="px-4 py-2 bg-[#F54900] hover:bg-[#D93C00] rounded-md transition-colors"
                >
                  Entrar
                </Link>
                <Link
                  href="/auth/register"
                  className="px-4 py-2 border border-[#F54900] text-[#F54900] hover:bg-[#F54900] hover:text-white rounded-md transition-colors"
                >
                  Cadastre-se
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-white p-2"
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-[#111111] border-t border-[#333333] mt-2">
          <div className="px-4 py-4 space-y-4">
            {session ? (
              // Authenticated mobile navigation
              <>
                <div className="flex items-center border-b border-[#333333] pb-2 mb-2">
                  <UserCircle className="h-5 w-5 text-white mr-2" />
                  <span className="text-white">{session.user?.name || session.user?.email}</span>
                </div>
                
                <Link
                  href="/workspaces"
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  <Layers className="h-5 w-5 inline mr-2" />
                  Workspaces
                </Link>
                
                <Link
                  href="/profile"
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  <Settings className="h-5 w-5 inline mr-2" />
                  Configurações
                </Link>
                
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  <LogOut className="h-5 w-5 inline mr-2" />
                  Sair
                </button>
              </>
            ) : (
              // Unauthenticated mobile navigation
              <>
                <Link
                  href="#features"
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  Recursos
                </Link>
                <Link
                  href="#how-it-works"
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  Como funciona
                </Link>
                <Link
                  href="/auth/login"
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  Entrar
                </Link>
                <Link
                  href="/auth/register"
                  className="block py-2 text-white hover:text-[#F54900]"
                >
                  Cadastre-se
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}