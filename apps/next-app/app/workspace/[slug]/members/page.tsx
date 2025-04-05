'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../../../../../../apps/next-app/context/workspace-context';
import { Loader2, UserPlus, Trash2, Mail, Shield, Users, Eye } from 'lucide-react';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';

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
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-semibold text-center mb-8">Membros do Workspace</h1>
        
        {error && (
          <div className="bg-red-900/30 text-red-400 p-4 border border-red-800 rounded-md mb-6">
            {error}
            <button 
              className="float-right text-red-400 hover:text-red-300"
              onClick={() => setError('')}
            >
              &times;
            </button>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-200">Convidar Novo Membro</h2>
          <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Endereço de email"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F54900] focus:border-transparent"
                required
              />
            </div>
            <div className="w-full md:w-48">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#F54900] focus:border-transparent"
              >
                <option value="ADMIN">Administrador</option>
                <option value="MEMBER">Membro</option>
                <option value="VIEWER">Visualizador</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-[#F54900] hover:bg-[#D93C00] text-white rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Convidar
            </button>
          </form>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-200">Membros do Workspace</h2>
          {members.length === 0 ? (
            <p className="text-gray-400 italic">Nenhum membro encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Função</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">{member.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{member.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex items-center">
                          {getRoleIcon(member.role)}
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleRoleChange(member.id, value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                            disabled={workspace?.owner_id === member.userId}
                          >
                            <SelectContent>
                              <SelectItem value="ADMIN" disabled={workspace?.owner_id === member.userId}>Administrador</SelectItem> 
                              <SelectItem value="MEMBER" disabled={workspace?.owner_id === member.userId}>Membro</SelectItem>
                              <SelectItem value="VIEWER" disabled={workspace?.owner_id === member.userId}>Visualizador</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {workspace?.owner_id !== member.userId && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={workspace?.owner_id === member.userId}
                          >
                            Remover
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {invitations.length > 0 && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-gray-200">Convites Pendentes</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Função</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Expira em</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{invitation.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex items-center">
                          {getRoleIcon(invitation.role)}
                          <span className="ml-2">
                            {invitation.role === 'ADMIN' ? 'Administrador' : 
                             invitation.role === 'MEMBER' ? 'Membro' : 'Visualizador'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 flex gap-3">
                        <button
                          onClick={() => handleResendInvitation(invitation.id)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="Reenviar convite"
                        >
                          <Mail className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="Cancelar convite"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}