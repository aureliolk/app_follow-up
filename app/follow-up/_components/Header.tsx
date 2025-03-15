// app/follow-up/_components/Header.tsx
'use client';

import React from 'react';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <h1 className="text-3xl font-semibold text-center mb-8 text-white">
      {title}
    </h1>
  );
};