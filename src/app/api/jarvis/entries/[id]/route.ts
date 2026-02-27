import { NextRequest, NextResponse } from 'next/server';
import { db, entries } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';
import type { EntryType, EntryStatus, LogType } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const data = await db.query.entries.findFirst({
      where: and(
        eq(entries.id, params.id),
        eq(entries.userId, result.userId)
      ),
    });

    if (!data) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ data: mapEntryFromDb(data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const body = await request.json();
    
    const updateData: Partial<typeof entries.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.content !== undefined) updateData.content = body.content;
    if (body.type !== undefined) updateData.type = body.type as EntryType;
    if (body.status !== undefined) updateData.status = body.status as EntryStatus;
    if (body.position !== undefined) updateData.position = body.position;
    if (body.date !== undefined) updateData.date = body.date;
    if (body.log_type !== undefined) updateData.logType = body.log_type as LogType;
    if (body.collection_id !== undefined) updateData.collectionId = body.collection_id;
    if (body.monthly_id !== undefined) updateData.monthlyId = body.monthly_id;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const [data] = await db.update(entries)
      .set(updateData)
      .where(and(eq(entries.id, params.id), eq(entries.userId, result.userId)))
      .returning();

    if (!data) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ data: mapEntryFromDb(data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const result2 = await db.delete(entries)
      .where(and(eq(entries.id, params.id), eq(entries.userId, result.userId)));

    if (result2.rowCount === 0) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
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
