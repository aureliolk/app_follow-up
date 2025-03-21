'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();
  
  // Don't show footer on auth pages
  const isAuthPage = pathname?.startsWith('/auth');
  if (isAuthPage) return null;
  
  return (
    <footer className="py-10 px-4 border-t border-gray-800 bg-[#0a0a0a]">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
          <img width={35} height={35} src="https://app.lumibot.com.br/brand-assets/thumbnail-lumibot.svg" alt="Logo lumibot" />
            <span className="text-lg ml-2 font-bold text-white">LumibotAI</span>
          </div>
          <div className="flex gap-6">
            <Link href="#" className="text-gray-400 hover:text-white">Privacidade</Link>
            <Link href="#" className="text-gray-400 hover:text-white">Termos</Link>
            <Link href="#" className="text-gray-400 hover:text-white">Contato</Link>
          </div>
        </div>
        <div className="mt-8 text-center text-gray-500 text-sm">
          © 2025 <Link href={'https://lumibot.com.br/'}>LumibotAI</Link>. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}