import { Prisma } from '@prisma/client';

// Type definitions related to Pipeline Stages and Deals

// Keep the original Prisma-based type if it exists, or define manually if needed.
// Assuming the original was Prisma-based based on common patterns.
export type PipelineStageBasic = Prisma.PipelineStageGetPayload<{}>;

// Input type for updating a pipeline stage (name and color are optional)
export interface PipelineStageUpdateInput {
  name?: string;
  color?: string;
}

// Basic client info for selection lists
export interface ClientBasic {
  id: string;
  name: string | null; // Name can be null based on schema
}

// Input type for creating a new deal
export interface DealCreateInput {
  name: string;             // Renamed from title to name based on schema change
  stageId: string;          
  value?: number | null;     
  clientId: string;         // Mandatory based on schema
}

// Keep the original Prisma-based type for DealWithClient
// Deal type with client relation for Kanban cards
export type DealWithClient = Prisma.DealGetPayload<{
  include: {
    client: {
      select: { name: true, id: true }
    }
    // TODO: Include counts for notes/tasks if needed later
    // _count: {
    //   select: { notes: true, tasks: true }
    // }
  }
}>;


// You can add more specific types here as needed, e.g.:
// export type DealDetailed = Prisma.DealGetPayload<{
//   include: {
//     client: true,
//     stage: true,
//     assignedTo: true,
//     notes: { include: { author: true }, orderBy: { createdAt: 'desc' } },
//     tasks: { include: { assignedTo: true }, orderBy: { dueDate: 'asc' } },
//     documents: { include: { uploadedBy: true }, orderBy: { createdAt: 'desc' } },
//     activityLogs: { include: { user: true }, orderBy: { createdAt: 'desc' } }
//   }
// }>; 