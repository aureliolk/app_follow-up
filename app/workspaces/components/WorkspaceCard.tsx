'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Edit, Trash2, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/context/workspace-context';
import type { Workspace } from '@prisma/client';

interface WorkspaceCardProps {
  workspace: Workspace & {
    owner?: { id: string; name: string | null; email: string };
    _count?: { members: number };
  };
}

export default function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const router = useRouter();
  const { updateWorkspace, deleteWorkspace } = useWorkspace();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editName, setEditName] = useState(workspace.name);
  const [error, setError] = useState('');

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      await updateWorkspace(workspace.id, { name: editName });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Falha ao atualizar workspace');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este workspace? Esta ação não pode ser desfeita.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteWorkspace(workspace.id);
    } catch (err: any) {
      setError(err.message || 'Falha ao excluir workspace');
      setIsDeleting(false);
    }
  };

  return (
    <Card className="hover:bg-accent/5 transition-colors">
      <CardContent className="p-6">
        {error && (
          <div className="mb-4 p-3 text-sm bg-destructive/15 text-destructive rounded-md">
            {error}
          </div>
        )}

        {isEditing ? (
          <form onSubmit={handleUpdate} className="space-y-4">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome do workspace"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditName(workspace.name);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="font-semibold text-lg">{workspace.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Users className="h-4 w-4" />
                  <span>{workspace._count?.members || 1} membro(s)</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditing(true)}
                  disabled={isDeleting}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-destructive hover:text-destructive/80"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              asChild
              variant="default"
              className="w-full mt-4"
              disabled={isDeleting}
            >
              <Link href={`/workspace/${workspace.id}`}>
                Acessar Workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
} 