import { createNextRoute } from "@trigger.dev/nextjs/server";
import { client } from "@/lib/trigger"; // Importe seu cliente Trigger.dev

// Importe seus jobs aqui
import "./jobs"; // Onde seus jobs serão definidos

export const { POST, GET } = createNextRoute(client);