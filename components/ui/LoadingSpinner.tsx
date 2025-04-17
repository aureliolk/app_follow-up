'use client';

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Carregando...', 
  size = 'medium' 
}) => {
  const spinnerSizes = {
    small: 'h-4 w-4 border-2',
    medium: 'h-8 w-8 border-t-2 border-b-2',
    large: 'h-12 w-12 border-t-3 border-b-3'
  };

  return (
    <div className="p-8 text-center text-gray-400">
      <div 
        className={`inline-block animate-spin rounded-full ${spinnerSizes[size]} border-orange-500 mb-2`}
        aria-hidden="true"
      ></div>
      {message && <p>{message}</p>}
    </div>
  );
};

export default LoadingSpinner;