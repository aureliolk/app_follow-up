import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import "./globals.css";
import SessionProvider from "@/components/session-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { WorkspaceProvider } from '@/context/workspace-context';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FollowUpAI - Sistema Inteligente de Follow-up",
  description: "Automatize seus follow-ups com mensagens potencializadas por IA que se adaptam às respostas dos clientes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;  
}>) {
  return (
    <html lang="pt-br">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} >
        <Toaster position="top-right" />
        <SessionProvider>
        <WorkspaceProvider>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow pt-16">{children}</main>
            <Footer />
          </div>
          </WorkspaceProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
