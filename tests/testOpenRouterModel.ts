import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from 'ai';

async function testOpenRouterModel() {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const model = openrouter('google/gemini-2.0-flash-exp:free');

  const response = generateText({

    model,

    prompt: 'Write a vegetarian lasagna recipe for 4 people.',

  });

  const result = await response;

  return result.text;
}