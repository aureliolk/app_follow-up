// app/api/follow-up/remove-client/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db'; 
import { cancelScheduledMessages } from '../_lib/scheduler.ts';

export async function POST(request: Request) {
  try {
    // Extrair clientId do corpo da requisição
    const { clientId } = await request.json();
    
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'ID do cliente não fornecido' }, { status: 400 });
    }
    
    // Buscar todos os follow-ups do cliente
    const followUps = await prisma.followUp.findMany({
      where: { client_id: clientId }
    });
    
    // Para cada follow-up, cancelar mensagens agendadas e excluir registros relacionados
    for (const followUp of followUps) {
      // Cancelar mensagens agendadas
      await cancelScheduledMessages(followUp.id);
      
      // Excluir mensagens
      await prisma.followUpMessage.deleteMany({
        where: { follow_up_id: followUp.id }
      });
      
      // Excluir follow-up
      await prisma.followUp.delete({
        where: { id: followUp.id }
      });
    }
    
    return NextResponse.json({
      success: true,
      message: `Cliente ${clientId} removido com sucesso. ${followUps.length} follow-ups excluídos.`
    });
  } catch (error: any) {
    console.error('Erro ao remover cliente:', error);
    return NextResponse.json({ 
      success: false, 
      error: `Erro ao remover cliente: ${error.message || 'Erro desconhecido'}` 
    }, { status: 500 });
  }
}