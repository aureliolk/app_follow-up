// components/layout/AppContentWrapper.tsx (NOVO ARQUIVO)
'use client';

import { usePathname } from 'next/navigation';
import Header from '@/apps/next-app/components/header'; // Import o Header SEM early returns
import Footer from '@/apps/next-app/components/footer'; // Import o Footer

export default function AppContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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