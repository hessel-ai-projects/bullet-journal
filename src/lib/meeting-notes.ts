'use server';

import { db, meetingNotes, collections } from '@/lib/db';
import { eq, and, asc, desc } from 'drizzle-orm';
import { auth } from '@/auth';
import type { MeetingNote } from '@/lib/types';

// Helper to get current user ID from session
async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function fetchMeetingNotes(collectionId: string): Promise<MeetingNote[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.meetingNotes.findMany({
    where: and(
      eq(meetingNotes.userId, userId),
      eq(meetingNotes.collectionId, collectionId)
    ),
    orderBy: desc(meetingNotes.date),
  });

  return data.map(mapMeetingNoteFromDb);
}

export async function fetchMeetingNote(id: string): Promise<MeetingNote | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const data = await db.query.meetingNotes.findFirst({
    where: and(
      eq(meetingNotes.id, id),
      eq(meetingNotes.userId, userId)
    ),
  });

  return data ? mapMeetingNoteFromDb(data) : null;
}

export async function createMeetingNote(params: {
  collection_id: string;
  date: string;
  title: string;
  attendees?: string[];
  agenda?: string | null;
  notes?: string | null;
}): Promise<MeetingNote | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  try {
    const [data] = await db.insert(meetingNotes).values({
      userId,
      collectionId: params.collection_id,
      date: params.date,
      title: params.title,
      attendees: params.attendees ?? [],
      agenda: params.agenda,
      notes: params.notes,
    }).returning();

    if (!data) return null;
    return mapMeetingNoteFromDb(data);
  } catch (error) {
    console.error('Error creating meeting note:', error);
    return null;
  }
}

export async function updateMeetingNote(
  id: string,
  updates: Partial<Pick<MeetingNote, 'title' | 'date' | 'attendees' | 'agenda' | 'notes'>>
): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const result = await db.update(meetingNotes)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(eq(meetingNotes.id, id), eq(meetingNotes.userId, userId)));

  return result.rowCount !== null && result.rowCount > 0;
}

export async function deleteMeetingNote(id: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const result = await db.delete(meetingNotes)
    .where(and(eq(meetingNotes.id, id), eq(meetingNotes.userId, userId)));

  return result.rowCount !== null && result.rowCount > 0;
}

// Helper to map DB meeting note to MeetingNote type
function mapMeetingNoteFromDb(dbNote: typeof meetingNotes.$inferSelect): MeetingNote {
  return {
    id: dbNote.id,
    collection_id: dbNote.collectionId,
    user_id: dbNote.userId,
    date: dbNote.date,
    title: dbNote.title,
    attendees: dbNote.attendees ?? [],
    agenda: dbNote.agenda,
    notes: dbNote.notes,
    created_at: dbNote.createdAt.toISOString(),
    updated_at: dbNote.updatedAt.toISOString(),
  };
}
