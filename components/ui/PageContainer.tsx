'use client';

import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  adminBadge?: boolean;
  adminMessage?: string;
  adminBackLink?: {
    href: string;
    label: string;
  };
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title,
  subtitle,
  adminBadge = false,
  adminMessage = "Você está em modo de administração do sistema",
  adminBackLink
}) => {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {adminBadge && (
          <div className="mb-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-lg shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-xs font-bold bg-white text-purple-700 px-2 py-1 rounded-full mr-2">SUPER ADMIN</span>
                <h2 className="text-lg font-bold">{adminMessage}</h2>
              </div>
              {adminBackLink && (
                <div className="text-sm flex items-center">
                  <a 
                    href={adminBackLink.href} 
                    className="ml-4 bg-white text-purple-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-gray-100"
                  >
                    {adminBackLink.label}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {title && (
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-center mb-2">{title}</h1>
            {subtitle && <p className="text-center text-gray-400">{subtitle}</p>}
          </div>
        )}

        {children}
      </div>
    </div>
  );
};

export default PageContainer;