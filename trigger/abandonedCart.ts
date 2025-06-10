import { task } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db"; 
import { sendWhatsAppMessage } from "~/lib/services/whatsappService";
import { fetchAbandonedCarts } from "~/lib/services/nuvemshopAbandonedCartService";

export const fetchNuvemshopAbandonedCarts = task({
  id: "fetch-nuvemshop-abandoned-carts",
  run: async () => {
    const carts = await fetchAbandonedCarts();
    
    // Store carts in database
    await prisma.abandonedCart.createMany({
      data: carts.map(cart => ({
        cartId: cart.id,
        customerEmail: cart.customer?.email,
        customerPhone: cart.customer?.phone,
        totalAmount: cart.total,
        items: JSON.stringify(cart.items),
        storeId: cart.store_id,
        createdAt: new Date(cart.created_at),
      })),
      skipDuplicates: true
    });

    return carts;
  }
});

export const processAbandonedCartsWhatsapp = task({
  id: "process-abandoned-carts-whatsapp",
  run: async (payload: { cartIds: string[] }) => {
    const carts = await prisma.abandonedCart.findMany({
      where: { cartId: { in: payload.cartIds } }
    });

    for (const cart of carts) {
      if (cart.customerPhone) {
        await sendWhatsAppMessage({
          to: cart.customerPhone,
          message: `Hi! We noticed you left items in your cart. Your total is ${cart.totalAmount}. Complete your purchase here: [link]`
        });
      }
    }

    return { processed: carts.length };
  }
});