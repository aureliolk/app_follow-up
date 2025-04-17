import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/auth-utils";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getToken } from "next-auth/jwt";

export async function GET(
  request: NextRequest,
  context: { params: { id: string; webhookId: string } }
) {
  return withAuth(request, async (req: NextRequest) => {
    // Acessar params de forma assíncrona
    const { id: workspaceId, webhookId } = await context.params;
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

      // Buscar webhook específico
      const webhook = await prisma.workspaceWebhook.findFirst({
        where: {
          id: webhookId,
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
      });

      if (!webhook) {
        return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 });
      }

      return NextResponse.json({ webhook });
    } catch (error) {
      console.error("Erro ao buscar webhook:", error);
      return NextResponse.json(
        { error: "Erro ao buscar webhook" },
        { status: 500 }
      );
    }
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string; webhookId: string } }
) {
  return withAuth(request, async (req: NextRequest) => {
    // Acessar params de forma assíncrona
    const { id: workspaceId, webhookId } = await context.params;
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
      
      // Verificar se o webhook existe
      const existingWebhook = await prisma.workspaceWebhook.findFirst({
        where: {
          id: webhookId,
          workspace_id: workspaceId,
        },
      });

      if (!existingWebhook) {
        return NextResponse.json(
          { error: "Webhook não encontrado" },
          { status: 404 }
        );
      }

      // Verificar se está solicitando a geração de um novo segredo
      const regenerateSecret = body.regenerateSecret === true;
      let secret = undefined;

      if (regenerateSecret) {
        secret = randomBytes(32).toString("hex");
      }

      // Preparar dados para atualização
      const updateData: any = {};
      
      if (body.name !== undefined) updateData.name = body.name;
      if (body.url !== undefined) {
        // Validar URL
        try {
          new URL(body.url);
          updateData.url = body.url;
        } catch (e) {
          return NextResponse.json(
            { error: "URL inválida" },
            { status: 400 }
          );
        }
      }
      if (body.events !== undefined && Array.isArray(body.events)) {
        updateData.events = body.events;
      }
      if (body.active !== undefined) updateData.active = Boolean(body.active);
      if (secret) updateData.secret = secret;

      // Atualizar webhook
      const updatedWebhook = await prisma.workspaceWebhook.update({
        where: {
          id: webhookId,
        },
        data: updateData,
      });

      const response: any = {
        id: updatedWebhook.id,
        name: updatedWebhook.name,
        url: updatedWebhook.url,
        events: updatedWebhook.events,
        active: updatedWebhook.active,
        updated_at: updatedWebhook.updated_at,
      };

      // Incluir o novo segredo na resposta apenas se foi regenerado
      if (regenerateSecret) {
        response.secret = updatedWebhook.secret;
      }

      return NextResponse.json(response);
    } catch (error) {
      console.error("Erro ao atualizar webhook:", error);
      return NextResponse.json(
        { error: "Erro ao atualizar webhook" },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string; webhookId: string } }
) {
  return withAuth(request, async (req: NextRequest) => {
    // Acessar params de forma assíncrona
    const { id: workspaceId, webhookId } = await context.params;
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

      // Verificar se o webhook existe
      const existingWebhook = await prisma.workspaceWebhook.findFirst({
        where: {
          id: webhookId,
          workspace_id: workspaceId,
        },
      });

      if (!existingWebhook) {
        return NextResponse.json(
          { error: "Webhook não encontrado" },
          { status: 404 }
        );
      }

      // Excluir webhook
      await prisma.workspaceWebhook.delete({
        where: {
          id: webhookId,
        },
      });

      return NextResponse.json({
        message: "Webhook excluído com sucesso",
      });
    } catch (error) {
      console.error("Erro ao excluir webhook:", error);
      return NextResponse.json(
        { error: "Erro ao excluir webhook" },
        { status: 500 }
      );
    }
  });
}