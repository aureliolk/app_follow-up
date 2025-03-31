'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import Link from 'next/link';
import { Loader2, Home, Users, Settings, CheckSquare, MessageSquare, BookOpen } from 'lucide-react';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, isLoading } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !workspace) {
      // router.push('/workspaces');
    }
  }, [workspace, isLoading, router]);

  // Verificar qual página está ativa
  const isActive = (path: string) => {
    return pathname?.includes(path);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar - com espaçamento melhorado */}
      <aside className="w-64 bg-[#111] border-r border-[#222]">
        {/* Logo área */}
        <div className="flex items-center px-4 py-5">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white mr-2 text-lg font-bold">
              L
            </div>
            <span className="text-xl font-semibold text-white">LumibotAI</span>
          </div>
        </div>
        
        {/* Menu de Navegação */}
        <nav className="py-6">
          <ul className="space-y-1.5">
            <li>
              <Link
                href={`/workspace/${workspace.slug}`}
                className={`flex items-center px-4 py-3 ${
                  pathname === `/workspace/${workspace.slug}` 
                    ? 'bg-primary text-white font-medium' 
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200'
                }`}
              >
                <Home className="h-5 w-5 mr-3" />
                <span>Dashboard</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/members`}
                className={`flex items-center px-4 py-3 ${
                  isActive('/members') 
                    ? 'bg-primary text-white font-medium' 
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200'
                }`}
              >
                <Users className="h-5 w-5 mr-3" />
                <span>Membros</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/followup`}
                className={`flex items-center px-4 py-3 ${
                  isActive('/followup') 
                    ? 'bg-primary text-white font-medium' 
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200'
                }`}
              >
                <MessageSquare className="h-5 w-5 mr-3" />
                <span>Follow-up</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/campaigns`}
                className={`flex items-center px-4 py-3 ${
                  isActive('/campaigns') 
                    ? 'bg-primary text-white font-medium' 
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200'
                }`}
              >
                <CheckSquare className="h-5 w-5 mr-3" />
                <span>Campanhas</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/settings`}
                className={`flex items-center px-4 py-3 ${
                  isActive('/settings') 
                    ? 'bg-primary text-white font-medium' 
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200'
                }`}
              >
                <Settings className="h-5 w-5 mr-3" />
                <span>Configurações</span>
              </Link>
            </li>
          </ul>
          
          {/* Separador */}
          <div className="mx-4 my-6 border-t border-[#333]"></div>
          
          {/* Documentação API */}
          <ul>
            <li>
              <Link
                href="/api/docs"
                target="_blank"
                className="flex items-center px-4 py-3 text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200"
              >
                <BookOpen className="h-5 w-5 mr-3" />
                <span>Documentação API</span>
              </Link>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-[#0f1218] p-6">
        {children}
      </main>
    </div>
  );
}