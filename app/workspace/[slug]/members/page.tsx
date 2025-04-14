'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { Loader2, UserPlus, Trash2, Mail, Shield, Users, Eye } from 'lucide-react';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectTrigger, SelectValue } from '@/components/ui/select';

type Member = {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  status: 'ACTIVE' | 'PENDING';
  userId: string;
};

type Invitation = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  expiresAt: Date;
};

export default function WorkspaceMembers() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspace) return;
    
    const fetchMembers = async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}/members`);
        if (!response.ok) throw new Error('Failed to fetch members');
        const data = await response.json();
        setMembers(data.members);
        setInvitations(data.invitations);
      } catch (err) {
        setError('Failed to load workspace members');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMembers();
  }, [workspace]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !workspace) return;
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, role }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to send invitation');
      }
      
      const newInvitation = await response.json();
      setInvitations([...invitations, newInvitation]);
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    if (!workspace) return;
    
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (!response.ok) throw new Error('Failed to update member role');
      
      setMembers(members.map(member => 
        member.id === memberId ? { ...member, role: newRole } : member
      ));
    } catch (err) {
      setError('Failed to update member role');
      console.error(err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspace || !confirm('Tem certeza que deseja remover este membro?')) return;
    
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to remove member');
      
      setMembers(members.filter(member => member.id !== memberId));
    } catch (err) {
      setError('Failed to remove member');
      console.error(err);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!workspace || !confirm('Tem certeza que deseja cancelar este convite?')) return;
    
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to cancel invitation');
      
      setInvitations(invitations.filter(invitation => invitation.id !== invitationId));
    } catch (err) {
      setError('Failed to cancel invitation');
      console.error(err);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!workspace) return;
    
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/invitations/${invitationId}/resend`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to resend invitation');
      
      alert('Convite reenviado com sucesso!');
    } catch (err) {
      setError('Failed to resend invitation');
      console.error(err);
    }
  };

  // Função para obter o ícone baseado no papel do membro
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Shield className="w-4 h-4 text-orange-500" />;
      case 'MEMBER':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'VIEWER':
        return <Eye className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  if (workspaceLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-[#F54900]" />
      </div>
    );
  }

  if (!workspace) {
    router.push('/workspaces');
    return null;
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      <h1 className="text-2xl font-bold text-foreground">
        Gerenciar Membros
      </h1>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 border border-destructive/30 rounded-md">
          {error}
          <button 
            className="float-right text-destructive hover:text-destructive/80"
            onClick={() => setError('')}
          >
            &times;
          </button>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl text-card-foreground">Convidar Novo Membro</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Endereço de email"
                className="w-full"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="w-full md:w-48">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                className="w-full h-9 px-3 py-1 bg-input border border-input rounded-md text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmitting}
              >
                <option value="ADMIN">Administrador</option>
                <option value="MEMBER">Membro</option>
                <option value="VIEWER">Visualizador</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="whitespace-nowrap"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Convidar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl text-card-foreground">Membros Atuais</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground italic">Nenhum membro ativo encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Função</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-accent/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{member.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{member.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(member.role)}
                          <Select 
                            value={member.role}
                            onValueChange={(value) => handleRoleChange(member.id, value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                            disabled={workspace?.owner_id === member.userId}
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ADMIN" disabled={workspace?.owner_id === member.userId}>Admin</SelectItem>
                              <SelectItem value="MEMBER" disabled={workspace?.owner_id === member.userId}>Membro</SelectItem>
                              <SelectItem value="VIEWER" disabled={workspace?.owner_id === member.userId}>Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {workspace?.owner_id !== member.userId && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1"/> Remover
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl text-card-foreground">Convites Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Função</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Expira em</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="hover:bg-accent/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{invitation.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(invitation.role)}
                          <span className="ml-2 text-foreground">
                            {invitation.role === 'ADMIN' ? 'Administrador' : 
                             invitation.role === 'MEMBER' ? 'Membro' : 'Visualizador'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResendInvitation(invitation.id)}
                          className="text-primary hover:text-primary/80 h-7 w-7"
                          title="Reenviar convite"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="text-destructive hover:text-destructive/80 h-7 w-7"
                          title="Cancelar convite"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}