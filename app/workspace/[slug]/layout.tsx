'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import Link from 'next/link';
import { Loader2, Home, Users, Settings, CheckSquare, MessageSquare } from 'lucide-react';

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F54900]" />
      </div>
    );
  }

  if (!workspace) return null;

  // Verificar qual página está ativa
  const isActive = (path: string) => {
    return pathname?.includes(path);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0a0a] shadow-md">
        <div className="p-4 border-b border-[#333333]">
          <h2 className="font-bold text-lg truncate">{workspace.name}</h2>
        </div>
        <nav className="px-3 py-4">
          <ul className="space-y-2">
            <li>
              <Link
                href={`/workspace/${workspace.slug}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  pathname === `/workspace/${workspace.slug}` 
                    ? 'bg-[#F54900] text-white' 
                    : 'hover:bg-[#1a1a1a] text-gray-300'
                }`}
              >
                <Home className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/members`}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive('/members') 
                    ? 'bg-[#F54900] text-white' 
                    : 'hover:bg-[#1a1a1a] text-gray-300'
                }`}
              >
                <Users className="h-5 w-5" />
                <span>Membros</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/followup`}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive('/followup') 
                    ? 'bg-[#F54900] text-white' 
                    : 'hover:bg-[#1a1a1a] text-gray-300'
                }`}
              >
                <MessageSquare className="h-5 w-5" />
                <span>Follow-up</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/campaigns`}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive('/campaigns') 
                    ? 'bg-[#F54900] text-white' 
                    : 'hover:bg-[#1a1a1a] text-gray-300'
                }`}
              >
                <CheckSquare className="h-5 w-5" />
                <span>Campanhas</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/workspace/${workspace.slug}/settings`}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive('/settings') 
                    ? 'bg-[#F54900] text-white' 
                    : 'hover:bg-[#1a1a1a] text-gray-300'
                }`}
              >
                <Settings className="h-5 w-5" />
                <span>Configurações</span>
              </Link>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-[#0a0a0a] p-6">
        {children}
      </main>
    </div>
  );
}