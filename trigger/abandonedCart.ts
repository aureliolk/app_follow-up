import { task, schedules, wait } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { fetchAndProcessAbandonedCarts } from "@/lib/services/nuvemshopAbandonedCartService";

type AbandonedCart = {
  id: string;
  nuvemshopCheckoutId: string;
  customerPhone: string;
  status: string;
  workspaceId: string;
  customerEmail: string;
  customerName: string;
  checkoutUrl: string;
};

// Task agendada que roda a 15 minutos
// export const processAbandonedCarts = schedules.task({
//   id: "process-abandoned-carts",
//   cron: {
//     pattern: "*/15 * * * *", // A cada 15 minutos
//     timezone: "America/Sao_Paulo", 
//   },
//   run: async () => {
//     // Buscar todos os workspaces ativos
//     const workspaces = await prisma.workspace.findMany({
//       select: { id: true }
//     });

//     for (const workspace of workspaces) {
//       console.log(`Processing abandoned carts for workspace: ${workspace.id}`);

//       await fetchAndProcessAbandonedCarts(workspace.id);

//       // Buscar carrinhos pendentes no banco
//       const pendingCarts = await prisma.abandonedCart.findMany({
//         where: {
//           status: "PENDING",
//           workspaceId: workspace.id,
//         },
//       });

//       console.log(`Found ${pendingCarts} pending carts for workspace: ${workspace.id}`);

//       // Processar cada carrinho pendente
//       for (const cart of pendingCarts) {
//         // Trigger task individual para enviar lembrete
//         await sendWhatsAppReminderTask.trigger({
//           cartId: cart.id,
//           customerPhone: cart.customerPhone,
//           customerName: cart.customerName,
//           checkoutUrl: cart.checkoutUrl,
//           workspaceId: cart.workspaceId,
//         });
//       }

//       console.log(`Finished processing for workspace: ${workspace.id}. Found ${pendingCarts.length} pending carts.`);
//     }
//   },
// });

// Task individual para enviar lembrete via WhatsApp
export const sendWhatsAppReminderTask = task({
  id: "send-whatsapp-reminder",
  run: async (payload: {
    cartId: string;
    customerPhone: string;
    customerName: string;
    checkoutUrl: string;
    workspaceId: string;
  }) => {
    const { cartId, customerPhone, customerName, checkoutUrl, workspaceId } = payload;

    try {
      // Aqui você implementa o envio do WhatsApp
      // Exemplo usando uma API de WhatsApp (ajuste conforme sua integração)
      await sendWhatsAppMessage({
        phone: customerPhone,
        message: `Olá ${customerName}! Você esqueceu alguns itens no seu carrinho. Finalize sua compra: ${checkoutUrl}`,
        workspaceId,
      });

      // Atualizar status do carrinho para "REMINDER_SENT"
      await prisma.abandonedCart.update({
        where: { id: cartId },
        data: { 
          status: "REMINDER_SENT",
          lastReminderSent: new Date(),
        },
      });

      console.log(`WhatsApp reminder sent for cart: ${cartId} to ${customerPhone}`);
      
      return { success: true, cartId, phone: customerPhone };
    } catch (error) {
      console.error(`Failed to send WhatsApp reminder for cart ${cartId}:`, error);
      throw error;
    }
  },
});

// Task para processar um workspace específico (útil para triggers manuais)
// export const processWorkspaceAbandonedCarts = task({
//   id: "process-workspace-abandoned-carts",
//   run: async (payload: { workspaceId: string }) => {
//     const { workspaceId } = payload;

//     console.log(`Processing abandoned carts for workspace: ${workspaceId}`);
    
//     await fetchAndProcessAbandonedCarts(workspaceId);

//     const pendingCarts = await prisma.abandonedCart.findMany({
//       where: {
//         status: "PENDING",
//         workspaceId: workspaceId,
//       },
//     });

//     const results = [];
//     for (const cart of pendingCarts) {
//       const result = await sendWhatsAppReminderTask.trigger({
//         cartId: cart.id,
//         customerPhone: cart.customerPhone,
//         customerName: cart.customerName,
//         checkoutUrl: cart.checkoutUrl,
//         workspaceId: cart.workspaceId,
//       });
//       results.push(result);
//     }

//     return {
//       workspaceId,
//       processedCarts: pendingCarts.length,
//       results,
//     };
//   },
// });

// Função auxiliar para enviar WhatsApp (implemente conforme sua integração)
async function sendWhatsAppMessage(params: {
  phone: string;
  message: string;
  workspaceId: string;
}) {
  // Implementar integração com sua API de WhatsApp
  // Exemplo: Evolution API, Baileys, etc.
  console.log(`Sending WhatsApp to ${params.phone}: ${params.message}`);
  
  // Exemplo de implementação:
  // const response = await fetch('YOUR_WHATSAPP_API_ENDPOINT', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     phone: params.phone,
  //     message: params.message,
  //   }),
  // });
  // 
  // if (!response.ok) {
  //   throw new Error(`WhatsApp API error: ${response.statusText}`);
  // }
}

export const processAbandonedCarts = schedules.task({
  id: "process-abandoned-carts",
  cron: {
    pattern: "*/15 * * * *",
    timezone: "America/Sao_Paulo", 
  },
  run: async () => {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true }
    });

    for (const workspace of workspaces) {
      console.log(`Processing abandoned carts for workspace: ${workspace.id}`);

      await fetchAndProcessAbandonedCarts(workspace.id);

      // Calcular timestamp de 15 minutos atrás
      const thirtyMinutesAgo = new Date(Date.now() - 1 * 60 * 1000);

      console.log(`Fetching pending carts for workspace: ${workspace.id} created before ${thirtyMinutesAgo}`);

      // Buscar apenas carrinhos que foram abandonados há mais de 15 minutos
      const pendingCarts = await prisma.abandonedCart.findMany({
        where: {
          status: "PENDING",
          workspaceId: workspace.id,
          createdAt: {
            lte: thirtyMinutesAgo // Apenas carrinhos criados antes de 15 min atrás
          }
        },
      });

      console.log(`Found ${pendingCarts.length} pending carts for workspace: ${workspace.id}`);

      for (const cart of pendingCarts) {
        await sendWhatsAppReminderTask.trigger({
          cartId: cart.id,
          customerPhone: cart.customerPhone,
          customerName: cart.customerName,
          checkoutUrl: cart.checkoutUrl,
          workspaceId: cart.workspaceId,
        });
      }

      console.log(`Finished processing for workspace: ${workspace.id}. Found ${pendingCarts.length} pending carts.`);
    }
  },
});

// Task normal (não é schedules.task) que executa uma única vez
export const sendDelayedWhatsAppReminder = task({
  id: "send-delayed-whatsapp-reminder",
  run: async (payload: {
    cartId: string;
    customerPhone: string;
    customerName: string;
    checkoutUrl: string;
    workspaceId: string;
    sendAt: string; // Timestamp de quando deve ser enviado
  }) => {
    const { cartId, customerPhone, customerName, checkoutUrl, workspaceId } = payload;

    const sendAt = new Date((5 * 60 * 1000)); // 1 minuto no futuro
    console.log(`Scheduling WhatsApp reminder for cart ${cartId} to be sent at ${sendAt}`);

    // Aguardar até o momento específico
    await wait.until({ 
      date: new Date(sendAt),
      throwIfInThePast: false // Não dar erro se já passou do horário
    });

    try {
      await sendWhatsAppMessage({
        phone: customerPhone,
        message: `Olá ${customerName}! Você esqueceu alguns itens no seu carrinho. Finalize sua compra: ${checkoutUrl}`,
        workspaceId,
      });

      // await prisma.abandonedCart.update({
      //   where: { id: cartId },
      //   data: { 
      //     status: "REMINDER_SENT",
      //     lastReminderSent: new Date(),
      //   },
      // });

      console.log(`WhatsApp reminder sent for cart: ${cartId} to ${customerPhone}`);
      
      return { success: true, cartId, phone: customerPhone };
    } catch (error) {
      console.error(`Failed to send WhatsApp reminder for cart ${cartId}:`, error);
      throw error;
    }
  },
});