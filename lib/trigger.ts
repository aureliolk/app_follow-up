import { TriggerClient } from "@trigger.dev/sdk";

export const client = new TriggerClient({
  id: "nuvemshop-abandoned-cart", // Um ID único para seu projeto Trigger.dev
  apiKey: process.env.TRIGGER_API_KEY, // Sua API Key do Trigger.dev
  apiUrl: process.env.TRIGGER_API_URL, // Opcional, para self-hosted ou ambientes específicos
});