// src/app/api/ai/route.ts
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { createChat, loadChat } from './tools/chat-store';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  console.log('Messages', messages)
  
 
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    maxTokens: 1024,
    system: 'You are a helpful chatbot.',
    messages
  });

  return result.text;
} 

