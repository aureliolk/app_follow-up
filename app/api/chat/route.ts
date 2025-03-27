// src/app/api/ai/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createChat, loadChat } from './tools/chat-store';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  console.log('Messages', messages)
  
 
  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    // user: 'test-user'
  });

  return result.toDataStreamResponse();
} 

