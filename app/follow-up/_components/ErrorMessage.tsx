// app/follow-up/_components/ErrorMessage.tsx
'use client';

import React from 'react';

interface ErrorMessageProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onDismiss }) => {
  if (!message) return null;
  
  return (
    <div className="bg-red-900/50 border border-red-500 text-white px-4 py-3 rounded mb-4">
      {message}
      <button 
        className="float-right" 
        onClick={onDismiss}
      >
        &times;
      </button>
    </div>
  );
};