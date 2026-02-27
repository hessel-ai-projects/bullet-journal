import { NextRequest, NextResponse } from 'next/server';
import { db, entries } from '@/lib/db';
import { eq, and, asc } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';
import type { EntryType, EntryStatus } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const data = await db.query.entries.findMany({
      where: and(
        eq(entries.userId, result.userId),
        eq(entries.collectionId, params.id),
        eq(entries.logType, 'collection')
      ),
      orderBy: asc(entries.position),
    });

    return NextResponse.json({ data: data.map(mapEntryFromDb) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const body = await request.json();
    const today = new Date().toISOString().split('T')[0];

    const [data] = await db.insert(entries).values({
      userId: result.userId,
      type: body.type as EntryType,
      content: body.content,
      logType: 'collection',
      collectionId: params.id,
      date: body.date ?? today,
      position: body.position ?? 0,
      status: body.status ?? 'open',
      tags: body.tags ?? [],
      source: 'jarvis',
      taskUid: crypto.randomUUID(),
    }).returning();

    if (!data) {
      return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
    }

    return NextResponse.json({ data: mapEntryFromDb(data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function mapEntryFromDb(dbEntry: typeof entries.$inferSelect) {
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
