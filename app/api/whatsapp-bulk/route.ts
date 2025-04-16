import { prisma } from "@/lib/db";
import { sendWhatsappBulk } from "@/trigger/whatsappBulkSend";
import Papa from "papaparse";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const message = formData.get("message") as string;
  const intervalMs = Number(formData.get("intervalMs"));
  const workspaceId = formData.get("workspaceId") as string;


 

  // 1. Buscar configs do WhatsApp para o workspace 
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      whatsappAccessToken: true,
      whatsappPhoneNumberId: true,
    },
  });

  console.log("workspace", workspace);

  if (!workspace?.whatsappAccessToken || !workspace?.whatsappPhoneNumberId) {
    return new Response("Configuração do WhatsApp não encontrada para o workspace.", { status: 400 });
  }

  // 2. Parse do CSV
  const text = await file.text();
  const { data } = Papa.parse<{ phone: string; name: string }>(text, {
    header: true,
    skipEmptyLines: true,
  });

  // 3. Disparar a task
  await sendWhatsappBulk.trigger({
    contacts: data,
    message,
    intervalMs,
    phoneNumberId: workspace.whatsappPhoneNumberId,
    accessToken: workspace.whatsappAccessToken,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}