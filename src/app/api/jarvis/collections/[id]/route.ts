import { NextRequest, NextResponse } from 'next/server';
import { db, collections, entries, meetingNotes } from '@/lib/db';
import { eq, and, asc } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';
import type { CollectionType } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const data = await db.query.collections.findFirst({
      where: and(
        eq(collections.id, params.id),
        eq(collections.userId, result.userId)
      ),
    });

    if (!data) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ data: mapCollectionFromDb(data) });
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

    const updateData: Partial<typeof collections.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.template !== undefined) updateData.template = body.template;

    const [data] = await db.update(collections)
      .set(updateData)
      .where(and(eq(collections.id, params.id), eq(collections.userId, result.userId)))
      .returning();

    if (!data) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ data: mapCollectionFromDb(data) });
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
    // Delete entries first
    await db.delete(entries)
      .where(and(
        eq(entries.collectionId, params.id),
        eq(entries.userId, result.userId)
      ));

    // Delete meeting notes
    await db.delete(meetingNotes)
      .where(and(
        eq(meetingNotes.collectionId, params.id),
        eq(meetingNotes.userId, result.userId)
      ));

    // Delete collection
    const result2 = await db.delete(collections)
      .where(and(eq(collections.id, params.id), eq(collections.userId, result.userId)));

    if (result2.rowCount === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function mapCollectionFromDb(dbCollection: typeof collections.$inferSelect) {
  return {
    id: dbCollection.id,
    user_id: dbCollection.userId,
    name: dbCollection.name,
    type: dbCollection.type,
    icon: dbCollection.icon,
    template: dbCollection.template,
    created_at: dbCollection.createdAt.toISOString(),
  };
}
