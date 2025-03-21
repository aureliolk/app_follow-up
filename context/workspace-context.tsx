'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type Workspace = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
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
  switchWorkspace: () => {},
  createWorkspace: async () => ({} as Workspace),
  updateWorkspace: async () => ({} as Workspace),
  deleteWorkspace: async () => {},
  refreshWorkspaces: async () => {},
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

  // Fetch all workspaces for current user
  const fetchWorkspaces = async () => {
    if (status !== 'authenticated' || !session?.user) {
      setWorkspaces([]);
      setWorkspace(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/workspaces');
      if (!response.ok) throw new Error('Failed to fetch workspaces');
      
      const data = await response.json();
      setWorkspaces(data);
      return data;
    } catch (err) {
      console.error('Error fetching workspaces:', err);
      setError('Failed to load workspaces');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Load current workspace based on URL parameter
  const loadCurrentWorkspace = async (workspaceList: Workspace[]) => {
    const slug = params?.slug as string;
    if (!slug || !workspaceList.length) {
      setWorkspace(null);
      return;
    }

    const found = workspaceList.find(w => w.slug === slug);
    if (found) {
      setWorkspace(found);
    } else if (pathname?.includes('/workspace/')) {
      // If in workspace route but workspace not found, redirect to workspaces list
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
  }, [status, params?.slug]);

  // Switch to a different workspace
  const switchWorkspace = (workspaceSlug: string) => {
    const found = workspaces.find(w => w.slug === workspaceSlug);
    if (found) {
      router.push(`/workspace/${workspaceSlug}`);
    }
  };

  // Create a new workspace
  const createWorkspace = async (name: string): Promise<Workspace> => {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create workspace');
      }

      const newWorkspace = await response.json();
      setWorkspaces([...workspaces, newWorkspace]);
      return newWorkspace;
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
      throw err;
    }
  };

  // Update a workspace
  const updateWorkspace = async (id: string, data: { name?: string; slug?: string }): Promise<Workspace> => {
    try {
      const response = await fetch(`/api/workspaces/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update workspace');
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

  // Delete a workspace
  const deleteWorkspace = async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/workspaces/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete workspace');
      }

      setWorkspaces(workspaces.filter(w => w.id !== id));
      
      if (workspace?.id === id) {
        // If current workspace was deleted, redirect to workspaces list
        router.push('/workspaces');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete workspace');
      throw err;
    }
  };

  // Refresh workspaces list
  const refreshWorkspaces = async (): Promise<void> => {
    setIsLoading(true);
    const workspaceList = await fetchWorkspaces();
    await loadCurrentWorkspace(workspaceList || []);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces,
        isLoading,
        error,
        switchWorkspace,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};'