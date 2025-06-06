"use server";

import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function createQuickNote(workspaceId: string, content: string) {
  if (!workspaceId || !content) {
    return { success: false, error: 'workspaceId and content are required.' };
  }
  try {
    const note = await prisma.quickNote.create({
      data: {
        content,
        workspace_id: workspaceId,
      },
    });
    return { success: true, data: note };
  } catch (error) {
    return { success: false, error: 'Failed to create note.' };
  }
}

export async function getAllQuickNotes(workspaceId: string) {
  if (!workspaceId) {
    return { success: false, error: 'workspaceId is required.' };
  }
  try {
    const notes = await prisma.quickNote.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'desc' },
    });
    return { success: true, data: notes };
  } catch (error) {
    return { success: false, error: 'Failed to fetch notes.' };
  }
}