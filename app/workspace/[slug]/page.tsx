'use client';

import { useWorkspace } from '@/context/workspace-context';
import { Loader2 } from 'lucide-react';

export default function WorkspaceDashboard() {
  const { workspace, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome to {workspace.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Summary Cards */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <p className="text-gray-500 italic">No recent activity found.</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Campaigns</h2>
          <p className="text-gray-500 italic">No campaigns found.</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Team</h2>
          <p className="text-gray-500 italic">Workspace information will display here.</p>
        </div>
      </div>
    </div>
  );
}