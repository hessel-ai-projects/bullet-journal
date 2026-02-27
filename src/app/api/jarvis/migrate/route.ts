import { NextRequest, NextResponse } from 'next/server';
import { db, entries } from '@/lib/db';
import { eq, and, asc, gte, lte } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';

/**
 * POST /api/jarvis/migrate
 * Cross-month migration endpoint for Jarvis API
 */
export async function POST(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const body = await request.json();
    const { entry_id, target_month_date } = body;

    if (!entry_id || !target_month_date) {
      return NextResponse.json(
        { error: 'entry_id and target_month_date are required' },
        { status: 400 }
      );
    }

    const userId = result.userId;

    // Fetch the original entry
    const original = await db.query.entries.findFirst({
      where: and(eq(entries.id, entry_id), eq(entries.userId, userId)),
    });

    if (!original) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const monthlyId = original.monthlyId;

    // Mark old chain as migrated
    if (monthlyId) {
      // Daily entry — mark all peers + self as migrated
      await db.update(entries)
        .set({ status: 'migrated', updatedAt: new Date() })
        .where(and(
          eq(entries.userId, userId),
          eq(entries.monthlyId, monthlyId),
          eq(entries.logType, 'daily')
        ));
      await db.update(entries)
        .set({ status: 'migrated', updatedAt: new Date() })
        .where(and(eq(entries.id, monthlyId), eq(entries.userId, userId)));
    } else if (original.logType === 'monthly' || original.logType === 'future') {
      // Monthly/future entry — mark children as migrated
      await db.update(entries)
        .set({ status: 'migrated', updatedAt: new Date() })
        .where(and(
          eq(entries.userId, userId),
          eq(entries.monthlyId, original.id),
          eq(entries.logType, 'daily')
        ));
      await db.update(entries)
        .set({ status: 'migrated', updatedAt: new Date() })
        .where(and(eq(entries.id, entry_id), eq(entries.userId, userId)));
    } else {
      await db.update(entries)
        .set({ status: 'migrated', updatedAt: new Date() })
        .where(and(eq(entries.id, entry_id), eq(entries.userId, userId)));
    }

    // Fetch existing entries in target month for position
    const targetYear = parseInt(target_month_date.slice(0, 4));
    const targetMonth = parseInt(target_month_date.slice(5, 7));
    const start = `${target_month_date.slice(0, 7)}-01`;
    const endDate = new Date(targetYear, targetMonth, 0);
    const end = `${target_month_date.slice(0, 7)}-${String(endDate.getDate()).padStart(2, '0')}`;

    const existingInTarget = await db.query.entries.findMany({
      where: and(
        eq(entries.userId, userId),
        eq(entries.logType, 'monthly'),
        gte(entries.date, start),
        lte(entries.date, end)
      ),
    });

    // Create new monthly entry with SAME task_uid
    const [newEntry] = await db.insert(entries).values({
      userId,
      type: original.type,
      content: original.content,
      logType: 'monthly',
      date: target_month_date.slice(0, 7) + '-01',
      position: existingInTarget.length,
      status: 'open',
      taskUid: original.taskUid,  // SAME chain — never breaks
    }).returning();

    if (!newEntry) {
      return NextResponse.json({ error: 'Failed to create migrated entry' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        id: newEntry.id,
        user_id: newEntry.userId,
        type: newEntry.type,
        content: newEntry.content,
        status: newEntry.status,
        log_type: newEntry.logType,
        collection_id: newEntry.collectionId,
        date: newEntry.date,
        monthly_id: newEntry.monthlyId,
        task_uid: newEntry.taskUid,
        tags: newEntry.tags ?? [],
        position: newEntry.position ?? 0,
        google_event_id: newEntry.googleEventId,
        source: newEntry.source,
        created_at: newEntry.createdAt.toISOString(),
        updated_at: newEntry.updatedAt.toISOString(),
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
