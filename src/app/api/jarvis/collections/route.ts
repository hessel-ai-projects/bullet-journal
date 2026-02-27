import { NextRequest, NextResponse } from 'next/server';
import { db, collections } from '@/lib/db';
import { eq, and, asc } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';
import type { CollectionType } from '@/lib/types';

export async function GET(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const data = await db.query.collections.findMany({
      where: eq(collections.userId, result.userId),
      orderBy: asc(collections.createdAt),
    });

    return NextResponse.json({ data: data.map(mapCollectionFromDb) });
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

    const [data] = await db.insert(collections).values({
      userId: result.userId,
      name: body.name,
      type: body.type as CollectionType,
      icon: body.icon ?? '📋',
      template: body.template,
    }).returning();

    if (!data) {
      return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
    }

    return NextResponse.json({ data: mapCollectionFromDb(data) }, { status: 201 });
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
