import { NextRequest, NextResponse } from 'next/server';
import { db, entries } from '@/lib/db';
import { eq, and, asc, inArray, gte, lte } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';
import type { EntryType, EntryStatus, LogType } from '@/lib/types';

export async function GET(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const logType = url.searchParams.get('log_type');
  const collectionId = url.searchParams.get('collection_id');

  try {
    const data = await db.query.entries.findMany({
      where: and(
        eq(entries.userId, result.userId),
        date ? eq(entries.date, date) : undefined,
        logType ? eq(entries.logType, logType as LogType) : undefined,
        collectionId ? eq(entries.collectionId, collectionId) : undefined
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

export async function POST(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const body = await request.json();
    
    const [data] = await db.insert(entries).values({
      userId: result.userId,
      type: body.type as EntryType,
      content: body.content,
      logType: body.log_type as LogType,
      date: body.date,
      position: body.position ?? 0,
      status: body.status ?? 'open',
      collectionId: body.collection_id,
      monthlyId: body.monthly_id,
      taskUid: body.task_uid ?? crypto.randomUUID(),
      tags: body.tags ?? [],
      source: body.source ?? 'jarvis',
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
