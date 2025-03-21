'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { useSession } from 'next-auth/react';
import { Loader2, Plus, ArrowRight, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function WorkspacesList() {
  const { data: session, status } = useSession();
  const { workspaces, isLoading, createWorkspace, deleteWorkspace, updateWorkspace } = useWorkspace();
  const router = useRouter();
  
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  
  const [editingWorkspace, setEditingWorkspace] = useState<{id: string, name: string} | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    
    setIsCreating(true);
    setError('');
    
    try {
      const workspace = await createWorkspace(newWorkspaceName);
      setNewWorkspaceName('');
      router.push(`/workspace/${workspace.slug}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) {
      return;
    }
    
    try {
      await deleteWorkspace(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete workspace');
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkspace || !editingWorkspace.name.trim()) return;
    
    setIsEditing(true);
    setError('');
    
    try {
      await updateWorkspace(editingWorkspace.id, { name: editingWorkspace.name });
      setEditingWorkspace(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace');
    } finally {
      setIsEditing(false);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Your Workspaces</h1>
      
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">
          {error}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Create New Workspace</h2>
        <form onSubmit={handleCreateWorkspace} className="flex gap-4">
          <input
            type="text"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="Workspace name"
            className="flex-grow border border-gray-300 rounded-md px-4 py-2"
            required
          />
          <button
            type="submit"
            disabled={isCreating}
            className="bg-blue-600 text-white rounded-md px-6 py-2 flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create
          </button>
        </form>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Your Workspaces</h2>
        
        {workspaces.length === 0 ? (
          <p className="text-gray-500 italic">You don't have any workspaces yet. Create one to get started.</p>
        ) : (
          <div className="space-y-4">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="border border-gray-200 rounded-md p-4">
                {editingWorkspace?.id === workspace.id ? (
                  <form onSubmit={handleUpdateWorkspace} className="flex gap-2">
                    <input
                      type="text"
                      value={editingWorkspace.name}
                      onChange={(e) => setEditingWorkspace({...editingWorkspace, name: e.target.value})}
                      className="flex-grow border border-gray-300 rounded-md px-3 py-1"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isEditing}
                      className="bg-green-600 text-white rounded-md px-3 py-1 text-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingWorkspace(null)}
                      className="bg-gray-200 text-gray-800 rounded-md px-3 py-1 text-sm hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">{workspace.name}</h3>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setEditingWorkspace({id: workspace.id, name: workspace.name})}
                        className="text-gray-600 hover:text-gray-900"
                        title="Edit workspace"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspace(workspace.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete workspace"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                      <Link
                        href={`/workspace/${workspace.slug}`}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                      >
                        Enter <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}'