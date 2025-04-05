// components/layout/AppContentWrapper.tsx (NOVO ARQUIVO)
'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
// import { Sidebar } from './Sidebar'; // <<< COMENTADO: Arquivo não encontrado
// import { useLayoutStore } from "@/store/layoutStore"; // <<< COMENTADO: Pasta store não encontrada
import Header from '@/components/header';
import Footer from '@/components/footer';

export default function AppContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // const { isSidebarOpen } = useLayoutStore(); // <<< COMENTADO

  // Define as condições para NÃO mostrar Header e Footer globais
  const hideGlobalHeader = pathname?.startsWith('/workspace/') || pathname?.startsWith('/auth/');
  const hideGlobalFooter = pathname?.startsWith('/workspace/') || pathname?.startsWith('/auth/');

  return (
    <div className="flex flex-col min-h-screen">
      {!hideGlobalHeader && <Header />}
      <main className="flex-grow">{children}</main>
      {!hideGlobalFooter && <Footer />}
    </div>
  );
}