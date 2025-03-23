'use client';

import React from 'react';

interface ErrorMessageProps {
  message: string | null;
  onDismiss?: () => void;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onDismiss }) => {
  if (!message) return null;
  
  return (
    <div className="bg-red-900/30 text-red-400 p-4 border border-red-800 rounded-md mb-6">
      {message}
      {onDismiss && (
        <button 
          className="float-right text-red-400 hover:text-red-300"
          onClick={onDismiss}
          aria-label="Fechar"
        >
          &times;
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;