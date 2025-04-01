'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type Workspace = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  owner_id: string;
  createdAt: Date;
  updatedAt: Date;
  created_at: Date;
  updated_at: Date;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  _count?: {
    members: number;
  };
  lumibot_account_id?: string
  lumibot_api_token?: string
};

type WorkspaceContextType = {
  workspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceSlug: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: { name?: string; slug?: string }) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: null,
  workspaces: [],
  isLoading: true,
  error: null,
  switchWorkspace: () => { },
  createWorkspace: async () => ({} as Workspace),
  updateWorkspace: async () => ({} as Workspace),
  deleteWorkspace: async () => { },
  refreshWorkspaces: async () => { },
});

export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  let slug = params?.slug as string;

  // Fetch workspaces based on user role
  const fetchWorkspaces = async () => {
    if (status !== 'authenticated' || !session?.user) {
      setError('Usuário não autenticado');
      setIsLoading(false);
      return [];
    }

    // Check if user is super admin
    const isSuperAdmin = session.user.isSuperAdmin;
   

    try {
      // Use the appropriate endpoint based on user role
      const endpoint = isSuperAdmin
        ? '/api/workspaces/all' // Super admin endpoint to get all workspaces
        : '/api/workspaces';    // Regular user endpoint to get their workspaces


      const response = await fetch(endpoint, {
        // Include credentials and prevent caching
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch workspaces, status:', response.status);
        throw new Error('Failed to fetch workspaces');
      }

      const data = await response.json();
      console.log('Workspaces fetched:', data);
      setWorkspaces(data);
      setIsLoading(false);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to load workspaces');
      setIsLoading(false);
      return [];
    }
  };

  // Load current workspace based on URL parameter
  const loadCurrentWorkspace = async (workspaceList: Workspace[]) => {

    console.log(slug)
    // if (!slug) {
    //   setWorkspace(null);
    //   return;
    // }

    // Se a lista de workspaces estiver vazia mas estamos tentando acessar um workspace, 
    // não redirecione imediatamente - pode ser que os dados ainda não foram carregados
    if (!workspaceList.length) {
      console.log('Workspace list empty, not redirecting yet');
      return; // Não redirecione, apenas retorne
    }

    const found = workspaceList.find(w => w.slug === slug);
    if (found) {
      setWorkspace(found);
      // Armazenar o ID do workspace ativo no sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('activeWorkspaceId', found.id);
      }
    } else if (pathname?.includes('/workspace/')) {
      console.log('Workspace not found in list:', slug);
      console.log('Available workspaces:', workspaceList.map(w => w.slug));
      // Se não encontrar após ter uma lista carregada, aí sim redirecione
      router.push('/workspaces');
    }
  };

  // Initial load
  useEffect(() => {
    if (status === 'loading') return;

    const initializeWorkspaces = async () => {
      const workspaceList = await fetchWorkspaces();
      await loadCurrentWorkspace(workspaceList || []);
    };

    initializeWorkspaces();
  }, [status, params?.slug, pathname]);

  // Function to switch workspace
  const switchWorkspace = (workspaceSlug: string) => {
    const targetWorkspace = workspaces.find(w => w.slug === workspaceSlug);
    if (!targetWorkspace) {
      setError('Workspace not found');
      return;
    }

    // Store workspace ID in session storage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('activeWorkspaceId', targetWorkspace.id);
    }
    
    // Navigate to workspace
    router.push(`/workspace/${workspaceSlug}`);
  };

  // Function to create a new workspace
  const createWorkspace = async (name: string): Promise<Workspace> => {
    try {
      setIsLoading(true);

      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error('Failed to create workspace');
      }

      const newWorkspace = await response.json();

      // Update workspaces list
      setWorkspaces(prev => [...prev, newWorkspace]);
      setIsLoading(false);

      return newWorkspace;
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
      setIsLoading(false);
      throw err;
    }
  };

  // Function to update a workspace
  const updateWorkspace = async (id: string, data: { name?: string; slug?: string }): Promise<Workspace> => {
    try {
      const response = await fetch(`/api/workspaces/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update workspace');
      }

      const updatedWorkspace = await response.json();

      setWorkspaces(workspaces.map(w =>
        w.id === id ? updatedWorkspace : w
      ));

      if (workspace?.id === id) {
        setWorkspace(updatedWorkspace);
        if (data.slug && data.slug !== workspace.slug) {
          router.push(`/workspace/${data.slug}`);
        }
      }

      return updatedWorkspace;
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace');
      throw err;
    }
  };

  // Function to delete a workspace
  const deleteWorkspace = async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/workspaces/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete workspace');
      }

      setWorkspaces(workspaces.filter(w => w.id !== id));

      if (workspace?.id === id) {
        setWorkspace(null);
        // Remove workspace ID from session storage
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('activeWorkspaceId');
        }
        // If current workspace was deleted, redirect to workspaces list
        router.push('/workspaces');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete workspace');
      throw err;
    }
  };

  // Function to refresh workspaces list
  const refreshWorkspaces = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await fetchWorkspaces();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh workspaces');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <WorkspaceContext.Provider value={{
      workspace,
      workspaces,
      isLoading,
      error,
      switchWorkspace,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      refreshWorkspaces
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};