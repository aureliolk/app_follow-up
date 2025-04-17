import { prisma } from "@/lib/db";
import { sendWhatsappBulk } from "@/trigger/whatsappBulkSend";
import Papa from "papaparse";
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  // AUTHENTICATION & AUTHORIZATION CHECK
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;
  
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const message = formData.get("message") as string;
  const intervalMs = Number(formData.get("intervalMs"));
  const workspaceId = formData.get("workspaceId") as string;

  if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
  }

  // Check permission (e.g., ADMIN to send bulk messages)
  const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
  if (!hasPermission) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // END AUTH CHECK

  // Check if file exists and is a CSV
  if (!file || file.type !== 'text/csv') {
    return NextResponse.json({ error: "Invalid file type. Please upload a CSV." }, { status: 400 });
  }

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