// app/api/follow-up/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cancelScheduledMessages } from '../_lib/scheduler.ts';
import { any, z } from 'zod';

// Schema para validação do corpo da requisição
const cancelRequestSchema = z.object({
  followUpId: z.string().optional(),
  clientId: z.string().optional(),
  reason: z.string().optional(),
  cancelAllForClient: z.boolean().optional().default(false)
}).refine(data => data.followUpId || data.clientId, {
  message: "Você deve fornecer followUpId ou clientId",
  path: ["followUpId"]
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validar o corpo da requisição
    const validationResult = cancelRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Dados inválidos", 
          details: validationResult.error.format() 
        }, 
        { status: 400 }
      );
    }
    
    const { followUpId, clientId, reason, cancelAllForClient } = validationResult.data;
    
    // Se temos followUpId, cancelar apenas este follow-up específico
    if (followUpId) {
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId }
      });
      
      if (!followUp) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Follow-up não encontrado"
          }, 
          { status: 404 }
        );
      }
      
      // Verificar se já está cancelado
      if (followUp.status === 'canceled') {
        return NextResponse.json({
          success: true,
          message: "Follow-up já estava cancelado",
          followUpId: followUp.id
        });
      }
      
      // Cancelar o follow-up
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: 'canceled',
          completed_at: new Date(),
          metadata: reason ? JSON.stringify({ cancelReason: reason }) : undefined
        }
      });
      
      // Cancelar mensagens agendadas
      await cancelScheduledMessages(followUpId);
      
      return NextResponse.json({
        success: true,
        message: "Follow-up cancelado com sucesso",
        followUpId
      });
    }
    
    // Se temos clientId, podemos cancelar um ou todos os follow-ups ativos
    if (clientId) {
      // Buscar follow-ups ativos para este cliente
      const activeFollowUps = await prisma.followUp.findMany({
        where: {
          client_id: clientId,
          status: { in: ['active', 'paused'] }
        }
      });
      
      if (activeFollowUps.length === 0) {
        return NextResponse.json({
          success: true,
          message: "Não há follow-ups ativos para este cliente",
          count: 0
        });
      }
      
      // Se cancelAllForClient for true, cancelar todos os follow-ups ativos
      if (cancelAllForClient) {
        const followUpIds = activeFollowUps.map(f => f.id);
        
        // Atualizar status para todos os follow-ups
        await prisma.followUp.updateMany({
          where: { id: { in: followUpIds } },
          data: {
            status: 'canceled',
            completed_at: new Date()
          }
        });
        
        // Cancelar mensagens agendadas para todos
        for (const id of followUpIds) {
          await cancelScheduledMessages(id);
        }
        
        return NextResponse.json({
          success: true,
          message: `${followUpIds.length} follow-ups cancelados com sucesso`,
          count: followUpIds.length,
          followUpIds
        });
      } else {
        // Cancelar apenas o follow-up mais recente
        const mostRecentFollowUp = activeFollowUps.sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        )[0];
        
        await prisma.followUp.update({
          where: { id: mostRecentFollowUp.id },
          data: {
            status: 'canceled',
            completed_at: new Date(),
            metadata: reason ? JSON.stringify({ cancelReason: reason }) : undefined 
          }
        });
        
        // Cancelar mensagens agendadas
        await cancelScheduledMessages(mostRecentFollowUp.id);
        
        return NextResponse.json({
          success: true,
          message: "Follow-up mais recente cancelado com sucesso",
          followUpId: mostRecentFollowUp.id
        });
      }
    }
    
  } catch (error) {
    console.error("Erro ao cancelar follow-up:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor", 
        details: error instanceof Error ? error.message : "Erro desconhecido"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para cancelar via GET (menos recomendado, mas útil para testes)
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const followUpId = searchParams.get('id');
    const clientId = searchParams.get('clientId');
    
    if (!followUpId && !clientId) {
      return NextResponse.json(
        { 
          success: false, 
          error: "É necessário fornecer id ou clientId"
        }, 
        { status: 400 }
      );
    }
    
    // Lógica para cancelar com os parâmetros da URL
    // Seguir o mesmo padrão do POST, mas com menos opções
    if (followUpId) {
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId }
      });
      
      if (!followUp) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Follow-up não encontrado "
          }, 
          { status: 404 }
        );
      }
      
      if (followUp.status === 'canceled') {
        return NextResponse.json({
          success: true,
          message: "Follow-up já estava cancelado"
        });
      }
      
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: 'canceled',
          completed_at: new Date()
        }
      });
      
      await cancelScheduledMessages(followUpId);
      
      return NextResponse.json({
        success: true,
        message: "Follow-up cancelado com sucesso"
      });
    }
    
    if (clientId) {
      // Buscar o follow-up mais recente para este cliente
      const mostRecentFollowUp = await prisma.followUp.findFirst({
        where: {
          client_id: clientId,
          status: { in: ['active', 'paused'] }
        },
        orderBy: { started_at: 'desc' }
      });
      
      if (!mostRecentFollowUp) {
        return NextResponse.json({
          success: true,
          message: "Não há follow-ups ativos para este cliente"
        });
      }
      
      await prisma.followUp.update({
        where: { id: mostRecentFollowUp.id },
        data: {
          status: 'canceled',
          completed_at: new Date()
        }
      });
      
      await cancelScheduledMessages(mostRecentFollowUp.id);
      
      return NextResponse.json({
        success: true,
        message: "Follow-up mais recente cancelado com sucesso",
        followUpId: mostRecentFollowUp.id
      });
    }
    
  } catch (error) {
    console.error("Erro ao cancelar follow-up via GET:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}