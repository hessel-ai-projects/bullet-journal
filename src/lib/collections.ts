'use server';

import { db, collections, entries, meetingNotes } from '@/lib/db';
import { eq, and, asc, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import type { Collection, CollectionType, Entry } from '@/lib/types';

// Helper to get current user ID from session
async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const BUILT_IN_COLLECTIONS: Record<string, { name: string; icon: string }> = {
  meetings: { name: 'Meeting Notes', icon: '📋' },
  ideas: { name: 'Ideas', icon: '💡' },
};

export async function fetchCollections(): Promise<Collection[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    orderBy: asc(collections.createdAt),
  });

  return data.map(mapCollectionFromDb);
}

export async function fetchCollection(id: string): Promise<Collection | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const data = await db.query.collections.findFirst({
    where: and(eq(collections.id, id), eq(collections.userId, userId)),
  });

  return data ? mapCollectionFromDb(data) : null;
}

export async function fetchCollectionByType(type: CollectionType): Promise<Collection | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const data = await db.query.collections.findFirst({
    where: and(
      eq(collections.userId, userId),
      eq(collections.type, type)
    ),
  });

  if (data) return mapCollectionFromDb(data);

  // Auto-create built-in collections if they don't exist
  const builtin = BUILT_IN_COLLECTIONS[type];
  if (builtin) {
    return createCollection({ name: builtin.name, type, icon: builtin.icon });
  }

  return null;
}

export async function createCollection(params: {
  name: string;
  type: CollectionType;
  icon: string;
  template?: Record<string, unknown>;
}): Promise<Collection | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  try {
    const [data] = await db.insert(collections).values({
      userId,
      name: params.name,
      type,
      icon: params.icon,
      template: params.template,
    }).returning();

    if (!data) return null;
    return mapCollectionFromDb(data);
  } catch (error) {
    console.error('Error creating collection:', error);
    return null;
  }
}

export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'icon'>>
): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const result = await db.update(collections)
    .set(updates)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)));

  return result.rowCount !== null && result.rowCount > 0;
}

export async function deleteCollection(id: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  try {
    // Delete all entries in collection first
    await db.delete(entries)
      .where(and(
        eq(entries.collectionId, id),
        eq(entries.userId, userId)
      ));

    // Delete meeting notes if any
    await db.delete(meetingNotes)
      .where(and(
        eq(meetingNotes.collectionId, id),
        eq(meetingNotes.userId, userId)
      ));

    // Delete the collection
    const result = await db.delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)));

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting collection:', error);
    return false;
  }
}

export async function fetchCollectionEntries(collectionId: string): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.collectionId, collectionId)
    ),
    orderBy: asc(entries.position),
  });

  return data.map(mapEntryFromDb);
}

export async function createCollectionEntry(params: {
  collection_id: string;
  type: 'task' | 'event' | 'note';
  content: string;
  tags?: string[];
  position: number;
}): Promise<Entry | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const today = new Date().toISOString().split('T')[0];

  try {
    const [data] = await db.insert(entries).values({
      userId,
      type: params.type,
      content: params.content,
      logType: 'collection',
      collectionId: params.collection_id,
      date: today,
      position: params.position,
      tags: params.tags ?? [],
      taskUid: crypto.randomUUID(),
    }).returning();

    if (!data) return null;
    return mapEntryFromDb(data);
  } catch (error) {
    console.error('Error creating collection entry:', error);
    return null;
  }
}

export async function fetchActionItems(meetingNoteId: string, collectionId: string): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.collectionId, collectionId),
      sql`${entries.tags} @> ARRAY[${`meeting:${meetingNoteId}`}]::text[]`
    ),
    orderBy: asc(entries.position),
  });

  return data.map(mapEntryFromDb);
}

export async function createActionItem(params: {
  collection_id: string;
  meeting_note_id: string;
  content: string;
  position: number;
}): Promise<Entry | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const today = new Date().toISOString().split('T')[0];
  const monthStr = `${today.slice(0, 7)}-01`;

  try {
    // Create as a monthly task (so it shows in monthly log)
    const [data] = await db.insert(entries).values({
      userId,
      type: 'task',
      content: params.content,
      logType: 'monthly',
      collectionId: params.collection_id,
      date: monthStr,
      position: params.position,
      tags: [`meeting:${params.meeting_note_id}`],
      taskUid: crypto.randomUUID(),
    }).returning();

    if (!data) return null;
    return mapEntryFromDb(data);
  } catch (error) {
    console.error('Error creating action item:', error);
    return null;
  }
}

// Helper to map DB collection to Collection type
function mapCollectionFromDb(dbCollection: typeof collections.$inferSelect): Collection {
  return {
    id: dbCollection.id,
    user_id: dbCollection.userId,
    name: dbCollection.name,
    type: dbCollection.type as CollectionType,
    icon: dbCollection.icon ?? '📋',
    template: dbCollection.template,
    created_at: dbCollection.createdAt.toISOString(),
  };
}

// Helper to map DB entry to Entry type
function mapEntryFromDb(dbEntry: typeof entries.$inferSelect): Entry {
  return {
    id: dbEntry.id,
    user_id: dbEntry.userId,
    type: dbEntry.type,
    content: dbEntry.content,
    status: dbEntry.status,
    log_type: dbEntry.logType,
    collection_id: dbEntry.collectionId,
    date: dbEntry.date,
    monthly_id: dbEntry.monthlyId,
    task_uid: dbEntry.taskUid,
    tags: dbEntry.tags ?? [],
    position: dbEntry.position ?? 0,
    google_event_id: dbEntry.googleEventId,
    source: dbEntry.source,
    created_at: dbEntry.createdAt.toISOString(),
    updated_at: dbEntry.updatedAt.toISOString(),
  };
}
