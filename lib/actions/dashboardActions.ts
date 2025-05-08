'use server';

import { prisma } from '@/lib/db';
import { ActivitySource, ConversationStatus } from '@prisma/client'; // Include ActivitySource
import { checkPermission } from '@/lib/permissions'; // Assuming permission check is needed
import { authOptions } from '@/lib/auth/auth-options';
import { getServerSession } from 'next-auth/next';

export interface DashboardGeneralStatsData {
  activeConversationsCount: number;
  totalClientsCount: number;
  teamMembersCount: number;
  activeFollowUpsCount: number;
  convertedFollowUpsCount: number;
}

export async function getDashboardGeneralStats(workspaceId: string): Promise<DashboardGeneralStatsData> {
  // Basic validation
  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  // TODO: Implement permission checks

  try {
    const [activeConversationsCount, totalClientsCount, teamMembersCount, activeFollowUpsCount, convertedFollowUpsCount] = await prisma.$transaction([
      prisma.conversation.count({
        where: { 
          workspace_id: workspaceId, 
          status: ConversationStatus.ACTIVE 
        },
      }),
      prisma.client.count({
        where: { workspace_id: workspaceId },
      }),
      prisma.workspaceMember.count({
        where: { workspace_id: workspaceId },
      }),
      prisma.followUp.count({
        where: {
          workspace_id: workspaceId,
          status: 'ACTIVE'
        },
      }),
      prisma.followUp.count({
        where: {
          workspace_id: workspaceId,
          status: 'CONVERTED'
        },
      }),
    ]);

    return {
      activeConversationsCount,
      totalClientsCount,
      teamMembersCount,
      activeFollowUpsCount,
      convertedFollowUpsCount,
    };
  } catch (error) {
    console.error(`[Action Error: getDashboardGeneralStats] Failed to fetch stats for workspace ${workspaceId}:`, error);
    throw new Error('Failed to fetch dashboard statistics.'); 
  }
} 

// --- Deals By Stage Data ---

export interface DealsByStageDataPoint {
  name: string;
  dealCount: number;
  color: string; 
}

export async function getDealsByStageData(workspaceId: string): Promise<DealsByStageDataPoint[]> {
  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  // TODO: Implement permission checks

  try {
    // 1. Fetch all pipeline stages ordered correctly
    const stages = await prisma.pipelineStage.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, color: true }, 
    });

    // 2. Fetch deal counts grouped by stage_id
    const dealCounts = await prisma.deal.groupBy({
      by: ['stage_id'],
      _count: {
        id: true, // Count deals by their id
      },
      where: {
        workspace_id: workspaceId,
      },
    });

    // 3. Map deal counts to a dictionary for easy lookup
    const dealCountMap = new Map<string, number>();
    dealCounts.forEach(item => {
      dealCountMap.set(item.stage_id, item._count.id);
    });

    // 4. Combine stage data with counts
    const dealsByStage = stages.map(stage => ({
      name: stage.name,
      dealCount: dealCountMap.get(stage.id) || 0, 
      color: stage.color || '#cccccc', 
    }));

    return dealsByStage;

  } catch (error) {
    console.error(`[Action Error: getDealsByStageData] Failed to fetch deals by stage for workspace ${workspaceId}:`, error);
    throw new Error('Failed to fetch deals by stage data.');
  }
} 

// --- Recent Activity Data ---

// Define ActivityLog type based on selection
export type ActivityLog = {
  id: string;
  action: string;
  message: string;
  createdAt: Date;
  source: ActivitySource;
  deal?: { id: string; name: string } | null;
  user?: { name?: string | null; image?: string | null } | null;
};

export async function getRecentActivities(workspaceId: string, limit: number = 5): Promise<ActivityLog[]> {
  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  // TODO: Implement permission checks

  try {
    const activities = await prisma.dealActivityLog.findMany({
      where: { 
        // Filter activities where the related deal belongs to the workspace
        deal: { 
          workspace_id: workspaceId 
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        message: true,
        createdAt: true,
        source: true, // Prisma automatically handles the enum type
        deal: {
          select: {
            id: true,
            name: true,
          }
        },
        user: { 
          select: {
            name: true,
            image: true,
          }
        }
      }
    });

    // The types should be compatible, Prisma handles the enum mapping
    return activities;

  } catch (error) {
    console.error(`[Action Error: getRecentActivities] Failed to fetch recent activities for workspace ${workspaceId}:`, error);
    throw new Error('Failed to fetch recent activities.');
  }
} 