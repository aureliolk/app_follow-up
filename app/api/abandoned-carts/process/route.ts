import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { processWorkspaceAbandonedCarts } from "@/trigger/abandonedCart";

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Trigger o processamento para um workspace específico
    const handle = await tasks.trigger<typeof processWorkspaceAbandonedCarts>(
      "process-workspace-abandoned-carts",
      { workspaceId }
    );

    return NextResponse.json({
      success: true,
      runId: handle.id,
      message: `Processing started for workspace ${workspaceId}`,
    });
  } catch (error) {
    console.error("Error triggering abandoned cart processing:", error);
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }
}