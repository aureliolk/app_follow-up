// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Keep Inter font
import "./globals.css"; // Importar o CSS global (agora configurado para v3)
// import { ThemeProvider } from "@/components/theme-provider"; // REMOVED
// import SessionProvider from "../components/session-provider"; // REMOVED
import { Toaster } from "react-hot-toast";
import { ClientProvider } from "../context/client-context"; // Use relative path
import { WorkspaceProvider } from "../context/workspace-context"; // Use relative path
import Script from 'next/script';
// import { GeistSans } from "geist/font/sans"; // REMOVED
// import { GeistMono } from "geist/font/mono"; // REMOVED
import Header from "@/components/header";
import Footer from "@/components/footer";
import { ConversationProvider } from '@/context/ConversationContext'; // Keep @/ path for now
import { FollowUpProvider } from "@/context/follow-up-context"; // Keep @/ path for now
import { Suspense } from "react"; // Import Suspense

const inter = Inter({ subsets: ["latin"] });

// Metadados (copie do seu projeto antigo ou ajuste)
export const metadata: Metadata = {
  title: "LumibotAI",
  description: "Plataforma de Inteligência Artificial",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br" suppressHydrationWarning> {/* Keep suppressHydrationWarning */}
      <body className={inter.className}> {/* Use Inter font class */}
        <WorkspaceProvider>
          <ClientProvider>
            <ConversationProvider>
              <FollowUpProvider>
                <div className="flex flex-col min-h-screen">
                  <Header />
                  <main className="flex-grow">
                    <Suspense fallback={<div>Carregando...</div>}> {/* Fallback geral ou para partes específicas */}
                      {children}
                    </Suspense>
                  </main>
                  <Footer />
                </div>
              </FollowUpProvider>
            </ConversationProvider>
            <Toaster position="bottom-right" />
          </ClientProvider>
        </WorkspaceProvider>
        {/* Google Analytics Script */}
        {process.env.NEXT_PUBLIC_GA_TRACKING_ID && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_TRACKING_ID}`}
            />
            <Script
              id="gtag-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${process.env.NEXT_PUBLIC_GA_TRACKING_ID}');
                `,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}