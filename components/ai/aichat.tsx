// src/components/AiChat.tsx
'use client';

import { useChat } from 'ai/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

export default function AiChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <div className="flex flex-col h-[600px] w-full max-w-2xl bg-white rounded-lg shadow">
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-grow">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-3 rounded-lg ${
              message.role === 'user' 
                ? 'bg-blue-100 ml-auto' 
                : 'bg-gray-100'
            } max-w-[80%]`}
          >
            <p className="text-sm">{message.content}</p>
          </div>
        ))}
        {isLoading && (
          <div className="p-3 rounded-lg bg-gray-100 max-w-[80%]">
            <p className="text-sm">Escrevendo...</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Envie uma mensagem..."
          className="flex-grow"
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}