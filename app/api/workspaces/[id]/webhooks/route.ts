import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/auth-utils";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHmac } from "crypto";
import { getToken } from "next-auth/jwt";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  return withAuth(request, async (req: NextRequest) => {
    // Acessar params de forma assíncrona
    const { id: workspaceId } = await context.params;
    try {
      const token = await getToken({ req });
      if (!token) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      
      const userId = token.id as string;

      // Verificar se o usuário tem permissão para este workspace
      const userMembership = await prisma.workspaceMember.findFirst({
        where: {
          workspace_id: workspaceId,
          user_id: userId,
        },
      });

      const isOwner = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          owner_id: userId,
        },
      });

      if (!userMembership && !isOwner && !token.isSuperAdmin) {
        return NextResponse.json(
          { error: "Sem permissão para este workspace" },
          { status: 403 }
        );
      }

      // Buscar webhooks do workspace
      const webhooks = await prisma.workspaceWebhook.findMany({
        where: {
          workspace_id: workspaceId,
        },
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          active: true,
          created_at: true,
          updated_at: true,
          last_used_at: true,
          creator: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      return NextResponse.json({ webhooks });
    } catch (error) {
      console.error("Erro ao buscar webhooks:", error);
      return NextResponse.json(
        { error: "Erro ao buscar webhooks" },
        { status: 500 }
      );
    }
  });
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  return withAuth(request, async (req: NextRequest) => {
    // Acessar params de forma assíncrona
    const { id: workspaceId } = await context.params;
    try {
      const token = await getToken({ req });
      if (!token) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      
      const userId = token.id as string;

      // Verificar se o usuário tem permissão para este workspace
      const userMembership = await prisma.workspaceMember.findFirst({
        where: {
          workspace_id: workspaceId,
          user_id: userId,
        },
      });

      const isOwner = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          owner_id: userId,
        },
      });

      if (!userMembership && !isOwner && !token.isSuperAdmin) {
        return NextResponse.json(
          { error: "Sem permissão para este workspace" },
          { status: 403 }
        );
      }

      const body = await request.json();
      const { name, url, events } = body;

      if (!name || !url || !events || !Array.isArray(events) || events.length === 0) {
        return NextResponse.json(
          { error: "Dados inválidos para criação do webhook" },
          { status: 400 }
        );
      }

      // Validar URL
      try {
        new URL(url);
      } catch (e) {
        return NextResponse.json(
          { error: "URL inválida" },
          { status: 400 }
        );
      }

      // Gerar um segredo para o webhook
      const secret = randomBytes(32).toString("hex");

      // Criar webhook
      const webhook = await prisma.workspaceWebhook.create({
        data: {
          name,
          url,
          events,
          secret,
          workspace_id: workspaceId,
          created_by: userId,
        },
      });

      return NextResponse.json({
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret, // Enviamos o segredo apenas uma vez
        active: webhook.active,
        created_at: webhook.created_at,
      });
    } catch (error) {
      console.error("Erro ao criar webhook:", error);
      return NextResponse.json(
        { error: "Erro ao criar webhook" },
        { status: 500 }
      );
    }
  });
}