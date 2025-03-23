'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { useSession } from 'next-auth/react';
import { Plus, ArrowRight, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PageContainer from '@/components/ui/PageContainer';
import ErrorMessage from '@/components/ui/ErrorMessage';

export default function WorkspacesList() {
  const { data: session, status } = useSession();
  const { workspaces, isLoading, createWorkspace, deleteWorkspace, updateWorkspace } = useWorkspace();
  const router = useRouter();

  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const [editingWorkspace, setEditingWorkspace] = useState<{ id: string, name: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Check if the user is a super admin
  const isSuperAdmin = session?.user?.isSuperAdmin;

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  // Redirecionar para a única workspace quando o usuário tem apenas uma
  useEffect(() => {
    if (!isLoading && workspaces.length === 1 && status === 'authenticated') {
      // Redirecionar para a única workspace
      router.push(`/workspace/${workspaces[0].slug}`);
    }
  }, [workspaces, isLoading, status, router]);

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
    if (!confirm('Tem certeza que deseja excluir este workspace? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await deleteWorkspace(id);
    } catch (err: any) {
      setError(err.message || 'Falha ao excluir workspace');
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
      setError(err.message || 'Falha ao atualizar workspace');
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <PageContainer 
      title={isSuperAdmin ? 'Todos os Workspaces' : 'Seus Workspaces'}
      adminBadge={isSuperAdmin}
      adminMessage="Modo de Administração do Sistema"
    >

        <ErrorMessage message={error} onDismiss={() => setError('')} />

        {/* Formulário para criar workspace */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Criar Novo Workspace</h2>
          <form onSubmit={handleCreateWorkspace} className="flex gap-4">
            <input
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="Nome do workspace"
              className="flex-grow bg-[#0a0a0a] border border-[#333333] text-white rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#F54900]"
              required
            />
            <button
              type="submit"
              disabled={isCreating}
              className="bg-[#F54900] text-white rounded-md px-6 py-2 flex items-center justify-center hover:bg-[#D93C00] disabled:opacity-50 transition-colors"
            >
              {isCreating ? (
                <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white mr-2"></div>
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Criar
            </button>
          </form>
        </div>

        {/* Lista de workspaces */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">
            {isSuperAdmin ? 'Todos os Workspaces do Sistema' : 'Seus Workspaces'}
          </h2>

          {isLoading ? (
            <LoadingSpinner message="Carregando workspaces..." />
          ) : workspaces.length === 0 ? (
            <p className="text-gray-400 italic py-6 text-center">Nenhum workspace encontrado. Crie um para começar.</p>
          ) : (
            <div className="space-y-4">
              {workspaces.map((workspace) => (
                <div key={workspace.id} className="border border-[#333333] rounded-lg p-4 hover:bg-[#1a1a1a] transition-colors">
                  {editingWorkspace?.id === workspace.id ? (
                    <form onSubmit={handleUpdateWorkspace} className="flex gap-2">
                      <input
                        type="text"
                        value={editingWorkspace.name}
                        onChange={(e) => setEditingWorkspace({ ...editingWorkspace, name: e.target.value })}
                        className="flex-grow bg-[#0a0a0a] border border-[#333333] text-white rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-[#F54900]"
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
                        className="bg-[#333333] text-white rounded-md px-3 py-1 text-sm hover:bg-[#444444]"
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
                            <p className="text-sm text-gray-400">
                              Proprietário: {workspace.owner.name || workspace.owner.email}
                              {/* Show a badge if the workspace owner is also super admin */}
                              {workspace.owner.id === session?.user?.id && (
                                <span className="ml-2 px-1.5 py-0.5 bg-purple-900/50 text-purple-200 text-xs rounded">Você</span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setEditingWorkspace({ id: workspace.id, name: workspace.name })}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Editar workspace"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorkspace(workspace.id)}
                            className="text-red-500 hover:text-red-400 transition-colors"
                            title="Excluir workspace"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                          <Link
                            href={`/workspace/${workspace.slug}`}
                            className="flex items-center gap-1 text-[#F54900] hover:text-[#FF6922] transition-colors"
                          >
                            Entrar <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>

                      {/* Display additional stats for super admin */}
                      {isSuperAdmin && workspace._count && (
                        <div className="mt-2 text-xs text-gray-400 flex gap-4">
                          <span className="bg-[#222222] px-2 py-1 rounded">
                            {workspace._count.members} membro{workspace._count.members !== 1 ? 's' : ''}
                          </span>
                          <span className="bg-[#222222] px-2 py-1 rounded">
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
      </PageContainer>
  );
}