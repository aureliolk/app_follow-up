// app/follow-up/_components/SearchBar.tsx
'use client';

import React from 'react';

interface SearchBarProps {
  searchTerm: string;
  onSearch: (term: string) => void;
  showNewForm: boolean;
  onToggleForm: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  searchTerm, 
  onSearch, 
  showNewForm, 
  onToggleForm 
}) => {
  return (
    <div className="flex space-x-2">
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={searchTerm}
        onChange={(e) => onSearch(e.target.value)}
        className="px-3 py-1 bg-gray-700 text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      <button
        onClick={onToggleForm}
        className="px-3 py-1 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700 transition-colors flex items-center"
      >
        {showNewForm ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Cancelar
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Novo Follow-up
          </>
        )}
      </button>
    </div>
  );
};