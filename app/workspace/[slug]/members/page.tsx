'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { Loader2, UserPlus, Trash2, Mail } from 'lucide-react';

type Member = {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  status: 'ACTIVE' | 'PENDING';
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
    if (!workspace || !confirm('Are you sure you want to remove this member?')) return;
    
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
    if (!workspace || !confirm('Are you sure you want to cancel this invitation?')) return;
    
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
      
      alert('Invitation resent successfully');
    } catch (err) {
      setError('Failed to resend invitation');
      console.error(err);
    }
  };

  if (workspaceLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!workspace) {
    router.push('/workspaces');
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Workspace Members</h1>
        <p className="text-gray-600">Manage members and permissions for {workspace.name}</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Invite New Member</h2>
        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full border border-gray-300 rounded-md px-4 py-2"
              required
            />
          </div>
          <div className="w-full md:w-48">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
              className="w-full border border-gray-300 rounded-md px-4 py-2"
            >
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white rounded-md px-6 py-2 flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Invite
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Workspace Members</h2>
        {members.length === 0 ? (
          <p className="text-gray-500 italic">No members found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{member.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{member.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                        className="border border-gray-300 rounded-md px-2 py-1"
                        disabled={workspace?.ownerId === member.id}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {workspace?.ownerId !== member.id && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Remove member"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
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
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Pending Invitations</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invitation.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invitation.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex gap-2">
                      <button
                        onClick={() => handleResendInvitation(invitation.id)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Resend invitation"
                      >
                        <Mail className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Cancel invitation"
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
  );
}