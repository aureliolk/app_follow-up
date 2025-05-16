// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css"; // Importar o CSS global (agora configurado para v3)
import SessionProvider from "../components/session-provider"; // Importar o Provider
import Header from "../components/header";
import Footer from "../components/footer";

import { WorkspaceProvider } from '../context/workspace-context';
import { ClientProvider } from '../context/client-context';
import { ConversationProvider } from '../context/ConversationContext';
import { FollowUpProvider } from "@/context/follow-up-context";

import { Toaster } from "@/components/ui/toaster"; // Certifique-se de que o caminho está correto


// Configuração das fontes (copie do seu projeto antigo ou ajuste)
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadados (copie do seu projeto antigo ou ajuste)
export const metadata: Metadata = {
  title: "Novo FollowUp AI", // Atualize o título se desejar
  description: "Novo sistema de Follow-up Inteligente.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Adicionar a classe 'dark' se quiser dark como padrão inicial
    <html lang="pt-br" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* <Toaster position="top-right" />  <- Adicionar Toaster aqui se usar */}

        {/* Envolver TUDO com o SessionProvider */}
        <SessionProvider>
          <WorkspaceProvider>
            <ClientProvider>
              <ConversationProvider>
                <FollowUpProvider>
                <div className="flex flex-col min-h-screen">
                  {/* Adicionar Header aqui depois */}
                  <Header />
                  <main className="flex-grow">{children}</main> {/* Adicionado flex-grow */}
                  {/* Adicionar Footer aqui depois */}
                  <Footer />
                </div>
                </FollowUpProvider>
              </ConversationProvider>
            </ClientProvider>
          </WorkspaceProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}