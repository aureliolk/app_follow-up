// app/follow-up/_components/MainNavigation.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const MainNavigation: React.FC = () => {
  const pathname = usePathname();
  
  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  
  return (
    <div className="bg-gray-800 p-4 border-b border-gray-700">
      <div className="container mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">
            Follow-up Manager
          </h1>
          <nav className="flex space-x-3">
            <Link 
              href="/follow-up" 
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                pathname === '/follow-up' 
                  ? 'bg-orange-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              Lista
            </Link>
            <Link 
              href="/follow-up/kanban" 
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                pathname === '/follow-up/kanban' 
                  ? 'bg-orange-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              Kanban
            </Link>
            <Link 
              href="/follow-up/campaigns" 
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                pathname.includes('/follow-up/campaigns') 
                  ? 'bg-orange-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              Campanhas
            </Link>
            <Link 
              href="/follow-up/stages" 
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                pathname.includes('/follow-up/stages') 
                  ? 'bg-orange-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              Estágios
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
};

export default MainNavigation;