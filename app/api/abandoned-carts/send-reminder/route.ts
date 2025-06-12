// app/api/abandoned-carts/send-reminder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import type { sendWhatsAppReminderTask } from "@/trigger/abandonedCart";

export async function POST(request: NextRequest) {
  try {
    const { cartId } = await request.json();

    if (!cartId) {
      return NextResponse.json(
        { error: "cartId is required" },
        { status: 400 }
      );
    }

    // Buscar dados do carrinho
    const cart = await prisma.abandonedCart.findUnique({
      where: { id: cartId },
    });

    if (!cart) {
      return NextResponse.json(
        { error: "Cart not found" },
        { status: 404 }
      );
    }

    // Trigger o envio do lembrete
    const handle = await tasks.trigger<typeof sendWhatsAppReminderTask>(
      "send-whatsapp-reminder",
      {
        cartId: cart.id,
        customerPhone: cart.customerPhone,
        customerName: cart.customerName,
        checkoutUrl: cart.checkoutUrl,
        workspaceId: cart.workspaceId,
      }
    );

    return NextResponse.json({
      success: true,
      runId: handle.id,
      message: `Reminder triggered for cart ${cartId}`,
    });
  } catch (error) {
    console.error("Error sending reminder:", error);
    return NextResponse.json(
      { error: "Failed to send reminder" },
      { status: 500 }
    );
  }
}