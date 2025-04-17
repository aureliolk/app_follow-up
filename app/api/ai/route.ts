import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { type CoreMessage, StreamData, streamText } from 'ai';
import { openai } from "@ai-sdk/openai";

// Keep the systemMessage function if needed, or remove if unused
// const systemMessage = (
//   role: 'user' | 'assistant' | 'system'
// ): 'user' | 'assistant' | 'system' => {
//   return role
// }

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Extract the `messages` from the body of the request
  const { messages }: { messages: CoreMessage[] } = await req.json();

  // Initialize StreamData
  const data = new StreamData();

  // Optional: Append initial data *before* calling streamText if needed
  // data.append({ initialInfo: 'Starting stream...' });

  // Call the language model
  const result = await streamText({
    model: openai('gpt-4o'),
    system:
      'Você é um assistente de IA chamado Lumibot. Você trabalha para a Lumina, uma empresa de desenvolvimento de software. Seu objetivo é auxiliar os usuários com suas dúvidas e problemas relacionados aos serviços da Lumina. Seja prestativo, amigável e profissional. Se o usuário expressar intenção de falar com um humano, responda APENAS com o texto: `Ok, estou transferindo você para um de nossos atendentes.` e NADA MAIS.', // System prompt
    messages: messages, // Pass existing messages
    // NO onCompletion or similar callbacks needed here when using experimental_streamData
    // The data stream is managed automatically.
  });

  // Saving the full conversation usually happens *after* the stream is finished,
  // often triggered from the client-side or a separate process,
  // as waiting here would delay the response stream start.

  // If you needed to access the final completion server-side *immediately* after
  // the stream finishes (before sending the response), you might iterate
  // through result.fullStream, but that defeats the purpose of streaming.

  // Append data just before closing the stream (will be sent at the end)
  // This is the place to append data that should only be available after the text stream is done.
  data.append({ server_message: "Stream processing complete." });
  data.close(); // Manually close StreamData *after* streamText is awaited

  // Respond with the stream
  return result.toDataStreamResponse({
    data: data, // Pass the StreamData instance
  });
}

// curl -X POST http://localhost:3000/api/ai -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "Me diga uma curiosidade sobre o Brasil."}]}'
// curl -X POST http://localhost:3000/api/ai -H "Content-Type: application/json" -d '{"messages": [{"role": "user", "content": "Quero falar com um atendente humano. estou com problema no sistema."}]}'