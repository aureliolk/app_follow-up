"use server";

import { prisma } from '@/lib/db';

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

export async function deleteQuickNote(noteId: string) {
  if (!noteId) {
    return { success: false, error: 'noteId is required.' };
  }
  try {
    await prisma.quickNote.delete({
      where: { id: noteId },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to delete note.' };
  }
}
  