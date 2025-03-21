'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import Link from 'next/link';
import { Loader2, Home, Users, Settings, CheckSquare } from 'lucide-react';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, isLoading } = useWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !workspace) {
      router.push('/workspaces');
    }
  }, [workspace, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg truncate">{workspace.name}</h2>
        </div>
        <nav className="p-2">
          <ul className="space-y-1">
            <li>
              <Link 
                href={`/workspace/${workspace.slug}`}
                className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-gray-100
              >
                <Home className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
            </li>
            <li>
              <Link 
                href={`/workspace/${workspace.slug}/members`}
                className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-gray-100
              >
                <Users className="h-5 w-5" />
                <span>Members</span>
              </Link>
            </li>
            <li>
              <Link 
                href={`/workspace/${workspace.slug}/campaigns`}
                className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-gray-100
              >
                <CheckSquare className="h-5 w-5" />
                <span>Campaigns</span>
              </Link>
            </li>
            <li>
              <Link 
                href={`/workspace/${workspace.slug}/settings`}
                className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-gray-100
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}