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
  
  // Check if the user is a super admin
  const isSuperAdmin = session?.user?.isSuperAdmin;

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
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-4" />
        <p className="text-gray-500">Carregando seus workspaces...</p>
        <p className="text-gray-400 text-sm mt-2">Se esta tela persistir por mais de 10 segundos, verifique se a API está funcionando corretamente.</p>
        <div className="mt-4 text-xs text-gray-400">
          Debug: Status: {status}, isLoading: {String(isLoading)}
        </div>
        
        {/* Adicionar um botão para forçar o refresh */}
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Forçar Atualização
        </button>
        
        {/* Adicionar um botão para ir para a dashboard do super admin manualmente */}
        <a 
          href="/follow-up" 
          className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
        >
          Dashboard Super Admin (Follow-ups)
        </a>
      </div>
    );
  }
  
  // Add console logging for debugging
  console.log('Workspace state:', { 
    status, 
    isLoading, 
    workspaces, 
    error,
    isSuperAdmin: session?.user?.isSuperAdmin 
  });
  
  console.log('Workspace state:', { status, isLoading, workspaces, error });

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Super Admin Badge */}
      {isSuperAdmin && (
        <div className="mb-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-xs font-bold bg-white text-purple-700 px-2 py-1 rounded-full mr-2">SUPER ADMIN</span>
              <h2 className="text-lg font-bold">Modo de Administração do Sistema</h2>
            </div>
            <div className="text-sm">
              <span>Você tem acesso a todos os workspaces no sistema</span>
            </div>
          </div>
        </div>
      )}
      
      <h1 className="text-3xl font-bold mb-8">
        {isSuperAdmin ? 'Todos os Workspaces' : 'Seus Workspaces'}
      </h1>
      
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">
          {error}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Criar Novo Workspace</h2>
        <form onSubmit={handleCreateWorkspace} className="flex gap-4">
          <input
            type="text"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="Nome do workspace"
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
            Criar
          </button>
        </form>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">
          {isSuperAdmin ? 'Todos os Workspaces do Sistema' : 'Seus Workspaces'}
        </h2>
        
        {workspaces.length === 0 ? (
          <p className="text-gray-500 italic">Nenhum workspace encontrado. Crie um para começar.</p>
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
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingWorkspace(null)}
                      className="bg-gray-200 text-gray-800 rounded-md px-3 py-1 text-sm hover:bg-gray-300"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium">{workspace.name}</h3>
                        {/* Display extra information for super admins */}
                        {isSuperAdmin && workspace.owner && (
                          <p className="text-sm text-gray-500">
                            Proprietário: {workspace.owner.name || workspace.owner.email}
                            {/* Show a badge if the workspace owner is also super admin */}
                            {workspace.owner.id === session?.user?.id && (
                              <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">Você</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setEditingWorkspace({id: workspace.id, name: workspace.name})}
                          className="text-gray-600 hover:text-gray-900"
                          title="Editar workspace"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Excluir workspace"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                        <Link
                          href={`/workspace/${workspace.slug}`}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          Entrar <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                    
                    {/* Display additional stats for super admin */}
                    {isSuperAdmin && workspace._count && (
                      <div className="mt-2 text-xs text-gray-500 flex gap-4">
                        <span className="bg-gray-100 px-2 py-1 rounded">
                          {workspace._count.members} membro{workspace._count.members !== 1 ? 's' : ''}
                        </span>
                        <span className="bg-gray-100 px-2 py-1 rounded">
                          Criado em: {new Date(workspace.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}