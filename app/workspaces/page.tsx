'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../../context/workspace-context';
import { useSession } from 'next-auth/react';
import { Plus, ArrowRight, Edit, Trash2, Loader2, Users } from 'lucide-react';
import Link from 'next/link';

// Importando Componentes Shadcn UI
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';

export default function WorkspacesList() {
  const { data: session, status } = useSession();
  const { workspaces, isLoading, createWorkspace, deleteWorkspace, updateWorkspace } = useWorkspace();
  const router = useRouter();

  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [editingWorkspace, setEditingWorkspace] = useState<{ id: string, name: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const isSuperAdmin = session?.user?.isSuperAdmin;

  // Filtrar workspaces para exibição
  const displayedWorkspaces = useMemo(() => {
    if (isLoading) return [];

    if (isSuperAdmin) {
      // Para Super Admin, aplicar a condição especial para o workspace específico
      return workspaces.filter(ws => {
        if (ws.id === '33c6cb57-24f7-4586-9122-f91aac8a098c') {
          return session?.user?.email === 'aurelio@lumibot.com.br';
        }
        return true; // Inclui todos os outros workspaces para Super Admin
      });
    }
    // Para não super admins, mostrar os workspaces aos quais eles têm acesso (fornecidos por useWorkspace)
    return workspaces;
  }, [workspaces, isLoading, isSuperAdmin, session?.user?.id, session?.user?.email]);

  // Redirecionamento
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && !isLoading && !isSuperAdmin) {
      // Usar displayedWorkspaces para a lógica de redirecionamento
      // (Esta parte já estava correta após sua reversão e a lógica anterior de displayedWorkspaces)
      if (displayedWorkspaces.length === 1) {
        router.push(`/workspace/${displayedWorkspaces[0].id}`);
      }
    }
  }, [status, router, isLoading, displayedWorkspaces, isSuperAdmin]);

  // Debug logs para ajudar a identificar problemas
  console.log("Debug workspaces:", {
    workspaces,
    isLoading,
    status,
    isSuperAdmin,
    workspacesLength: workspaces?.length
  });

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setIsCreating(true);
    setError('');
    try {
      const workspace = await createWorkspace(newWorkspaceName);
      setNewWorkspaceName('');
      router.push(`/workspace/${workspace.id}`);
    } catch (err: any) {
      setError(err.message || 'Falha ao criar workspace');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este workspace? Esta ação não pode ser desfeita.')) return;
    setIsDeleting(id);
    setError('');
    try {
      await deleteWorkspace(id);
    } catch (err: any) {
      setError(err.message || 'Falha ao excluir workspace');
    } finally {
      setIsDeleting(null);
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

  // Estado de Carregamento Principal
  if (status === 'loading' || (status === 'authenticated' && isLoading)) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-7xl">
        <LoadingSpinner message="Carregando workspaces..." />
      </div>
    );
  }

  // Se não autenticado (após carregar)
  if (status === 'unauthenticated') {
    return null; // Redirecionamento no useEffect cuida disso
  }

  return (
    <div className="bg-background min-h-screen pt-20">
      <div className="container mx-auto px-4 max-w-7xl py-8">
        {isSuperAdmin && (
          <div className="mb-6 bg-primary/10 border border-primary/30 rounded-lg p-3 text-primary dark:text-primary/90 text-sm">
            <strong>Modo Administrador:</strong> Visualizando todos os workspaces do sistema
          </div>
        )}

        <h1 className="text-3xl font-bold mb-6 text-foreground">
          {isSuperAdmin ? 'Gerenciamento de Workspaces' : 'Seus Workspaces'}
        </h1>

        <ErrorMessage message={error} onDismiss={() => setError('')} />

        {isSuperAdmin && (
          <>
            {/* Formulário para criar workspace */}
            <Card className="mb-8 border-border bg-card">
              <CardHeader>
                <CardTitle className="text-card-foreground">Criar Novo Workspace</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateWorkspace} className="flex flex-col sm:flex-row gap-4">
                  <Input
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="Nome do novo workspace"
                    className="flex-grow bg-input border-input text-foreground placeholder:text-muted-foreground"
                    required
                    disabled={isCreating}
                  />
                  <Button
                    type="submit"
                    disabled={isCreating || !newWorkspaceName.trim()}
                    className="w-full sm:w-auto"
                  >
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Criar
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}
        

        {/* Lista de workspaces */}
        <h2 className="text-xl font-semibold mb-4 text-foreground">
          {isSuperAdmin ? 'Todos os Workspaces' : 'Selecione um Workspace'}
        </h2>

        {!displayedWorkspaces || displayedWorkspaces.length === 0 ? (
          <Card className="border-border bg-card text-center py-8">
            <CardContent>
              <p className="text-muted-foreground italic">
                {isSuperAdmin 
                  ? "Nenhum workspace corresponde aos critérios de visualização ou nenhum foi criado."
                  : "Você não possui workspaces ou nenhum workspace corresponde aos critérios de visualização."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {displayedWorkspaces.map((workspace) => (
              <Card key={workspace.id} className="border-border bg-card hover:bg-accent/50 transition-colors">
                <CardContent className="p-4">
                  {editingWorkspace?.id === workspace.id ? (
                    <form onSubmit={handleUpdateWorkspace} className="flex flex-col sm:flex-row items-center gap-2">
                      <Input
                        type="text"
                        value={editingWorkspace.name}
                        onChange={(e) => setEditingWorkspace({ ...editingWorkspace, name: e.target.value })}
                        className="flex-grow bg-input border-input text-foreground placeholder:text-muted-foreground"
                        required
                        disabled={isEditing}
                        autoFocus
                      />
                      <div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0">
                        <Button
                          type="submit"
                          size="sm"
                          variant="secondary"
                          disabled={isEditing || !editingWorkspace.name.trim()}
                        >
                          {isEditing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingWorkspace(null)}
                          disabled={isEditing}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-grow min-w-0">
                        <h3 className="text-lg font-medium text-card-foreground truncate">{workspace.name}</h3>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3"/>
                            {(workspace._count?.members ?? 1)} Membro(s)
                          </span>
                          {workspace.owner && (
                            <>
                              <span>•</span>
                              <span className="truncate">Proprietário: {workspace.owner.name || workspace.owner.email}</span>
                            </>
                          )}
                          {workspace.owner?.id === session?.user?.id && (
                            <span className="ml-1 px-1.5 py-0.5 bg-primary/10 border border-primary/30 rounded-lg text-primary dark:text-primary/90">Você</span>
                          )}
                          <span>• Criado em: {new Date(workspace.created_at || workspace.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingWorkspace({ id: workspace.id, name: workspace.name })}
                          className="text-muted-foreground hover:text-foreground h-8 w-8"
                          title="Editar"
                          disabled={isDeleting === workspace.id}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                          className="text-destructive hover:text-destructive/80 h-8 w-8"
                          title="Excluir"
                          disabled={isDeleting === workspace.id}
                        >
                          {isDeleting === workspace.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4" />}
                        </Button>
                        <Button asChild variant="link" className="text-primary hover:text-primary/90 px-1">
                          <Link href={`/workspace/${workspace.id}`}>
                            Entrar <ArrowRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}