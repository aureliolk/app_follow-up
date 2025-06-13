import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils';
import { processClientAndConversation } from '@/lib/services/clientConversationService';
import { fetchAndProcessAbandonedCarts } from '@/lib/services/nuvemshopAbandonedCartService';
import { schedules } from '@trigger.dev/sdk/v3';
import { sendDelayedWhatsAppReminder } from '@/trigger/abandonedCart';
import { processAIChat } from '@/lib/ai/chatService';
import { getChatwootConversationIdByPhoneNumber, SendMsgChatWoot } from '@/lib/services/chatWootServices';
import { prisma } from '@/lib';


// Você pode adicionar um handler GET para simplesmente verificar se a rota está funcionando
export async function GET() {
  console.log('[API TEST] Recebida requisição GET para /api/test');

  // const data = await fetchAndProcessAbandonedCarts("33c6cb57-24f7-4586-9122-f91aac8a098c");
  // const allSchedules = await schedules.list();
  // const retrievedSchedule = await schedules.retrieve("sched_rmed1p5jbgamremnq2not");

  const activatedSchedule = await schedules.activate("sched_rmed1p5jbgamremnq2not");


  console.log('[API TEST] Dados processados:', activatedSchedule);

  const result = {
    message: 'API Test endpoint is working',
    timestamp: new Date().toISOString(),
    data: activatedSchedule
  };

  return NextResponse.json({ success: true, result: result });
}

// export async function POST(req: NextRequest) {
//     try {
//       const body = await req.json();
//       const systemPrompt = body.system;
//       const message = body.message;
//       const actualWorkspaceId = body.workspaceId;
//       const actualConversationId = body.conversationId; 
//       setCurrentWorkspaceId(actualWorkspaceId);


//       // Monta as mensagens no formato esperado
//       const messages: CoreMessage[] = [{ role: 'user', content: message }];

//       const openrouter = createOpenRouter({
//         apiKey: process.env.OPENROUTER_API_KEY,
//       });

//       // Chama o modelo diretamente
//       const aiResponseText = await generateText({
//         messages: messages,
//         model: openrouter("openai/gpt-4o-mini"),
//         system: `Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ${systemPrompt}`,
//         tools: {
//           humanTransferTool: tool({
//             description: 'Transferir a conversa para um humano. Após a transferência ser confirmada internamente, informe ao usuário de forma concisa que a conversa foi transferida.',
//             parameters: z.object({}),
//             execute: async () => {
//               // Chamar a Server Action para desativar a IA
//               try {
//                 const aiStatusUpdated = await setConversationAIStatus(actualConversationId, false, actualWorkspaceId);
//                 if (aiStatusUpdated) {
//                   console.log(`IA desativada para a conversa ${actualConversationId} no workspace ${actualWorkspaceId}`);
//                 } else {
//                   console.warn(`Não foi possível desativar a IA para a conversa ${actualConversationId} no workspace ${actualWorkspaceId} através da action.`);
//                 }
//               } catch (error) {
//                 console.error(`Erro ao tentar desativar a IA para a conversa ${actualConversationId}:`, error);
//                 return "Erro ao processar a transferência.";
//               }

//               return "A transferência para um humano foi processada com sucesso.";
//             },
//           }),
//           listCalendarEventsTool,
//           scheduleCalendarEventTool,
//         },

//         });

//       // if( aiResponseText.toolResults.length > 0){
//       //   return NextResponse.json({ response: aiResponseText.toolResults[0].result }, { status: 200 });
//       // }

//       // Retorna a resposta da IA
//       return NextResponse.json({ response: aiResponseText }, { status: 200 });

//     } catch (error) {
//       console.error('Erro na rota /api/ai:', error);
//       const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido';
//       return NextResponse.json(
//         { error: 'Falha ao gerar a conclusão do chat', details: errorMessage },
//         { status: 500 }
//       );
//     }
//   }


// export async function POST(req: NextRequest) {
//     const body = await req.json();
//     const message = body.message;

//     const responseCheckName = await aiResponseText([{ role: 'user', content: message }], systemPromptCheckName);
//     return NextResponse.json({ response: responseCheckName.text }, { status: 200 });
// }

// export async function POST(req: NextRequest) {
//     const body = await req.json();
//     const phoneNumber = body.phoneNumber
//     const senderName = body.senderName 
//     const workspaceId = body.workspaceId
//     const channel = body.channel
//     const nuvemshopStoreId = body.nuvemshopStoreId
//     const nuvemshopApiKey = body.nuvemshopApiKey


//     const result = await getNuvemShopIntegration(workspaceId);

//     const result = await UpdateNuvemShopIntegration(workspaceId, nuvemshopStoreId, nuvemshopApiKey);

//     console.log(`[API TEST] Recebida requisição POST para /api/test com os seguintes parâmetros: phoneNumber=${phoneNumber}, senderName=${senderName}, workspaceId=${workspaceId}`);

//     const { client, conversation } = await processClientAndConversation(
//         workspaceId,
//         standardizeBrazilianPhoneNumber(phoneNumber),
//         senderName,
//         channel
//     );



//     const result = await fetchAndProcessAbandonedCarts(workspaceId);

//     const result = await sendDelayedWhatsAppReminder.trigger({
//         cartId: "cart_12345",
//         customerPhone: standardizeBrazilianPhoneNumber(phoneNumber),
//         customerName: senderName,
//         checkoutUrl: "https://example.com/checkout",
//         workspaceId: workspaceId,
//         sendAt: "5 minutes from now", 
//     },{
//         delay: "1m"
//     })

//     console.log('Result of sendDelayedWhatsAppReminder:', result);

//     const data = {
//         accountId: "9",
//     phoneNumber: "+5521998892225"
//     }

//     const getTel = await getChatwootConversationIdByPhoneNumber(data)

//     console.log(getTel)

//     const params = {
//     accountId: data.accountId, 
//     conversationId: "996", 
//     content: "Teste envio para Carrinho abandonado"
//     };

//     const result = await SendMsgChatWoot(params)



//     return NextResponse.json({ response: getTel }, { status: 200 });
// }

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workspaceId = body.workspaceId

  // await fetchAndProcessAbandonedCarts("33c6cb57-24f7-4586-9122-f91aac8a098c");

  const pendingCarts = await prisma.abandonedCart.findMany({
    where: {
      workspaceId: workspaceId,
    },
    orderBy:{
      createdAt: "desc"
    }

  });

  console.log(`Found ${pendingCarts} pending carts for workspace: ${workspaceId}`);

  let cartPeddings = []


  for (const cart of pendingCarts) {
    cartPeddings.push({
      cartId: cart.id,
      customerPhone: cart.customerPhone,
      customerName: cart.customerName,
      checkoutUrl: cart.checkoutUrl,
      workspaceId: cart.workspaceId,
      status: cart.status, 
      createdAt: cart.createdAt
    })
  }

  console.log(cartPeddings)



  // await sendWhatsAppReminderTask.trigger({

  // });



  return NextResponse.json({ response: cartPeddings }, { status: 200 });
}