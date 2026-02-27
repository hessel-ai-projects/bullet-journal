'use server';

import { db, entries, profiles } from '@/lib/db';
import { eq, and, gte, lte, lt, gt, inArray, desc, asc, sql, ne } from 'drizzle-orm';
import { auth } from '@/auth';
import type { Entry, EntryType, EntryStatus } from '@/lib/types';

// Helper to get current user ID from session
async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// Re-export utilities from non-server file
export { parseEntryPrefix, bulletSymbol, statusSymbol } from './entries-utils';

// ── Fetch helpers ──

export async function fetchEntriesForDate(date: string): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.logType, 'daily'),
      eq(entries.date, date)
    ),
    orderBy: asc(entries.position),
  });

  return data.map(mapEntryFromDb);
}

export async function fetchEntriesForMonth(year: number, month: number): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.logType, 'daily'),
      gte(entries.date, start),
      lte(entries.date, end)
    ),
    orderBy: [asc(entries.date), asc(entries.position)],
  });

  return data.map(mapEntryFromDb);
}

/**
 * Fetch monthly-level entries for a given month.
 * Queries log_type IN ['monthly', 'future'] — both appear in the monthly panel.
 */
export async function fetchMonthlyEntries(year: number, month: number): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${monthStr}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${monthStr}-${String(endDate.getDate()).padStart(2, '0')}`;

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      inArray(entries.logType, ['monthly', 'future']),
      gte(entries.date, start),
      lte(entries.date, end)
    ),
    orderBy: asc(entries.position),
  });

  return data.map(mapEntryFromDb);
}

/**
 * Fetch future log entries. Queries log_type IN ['future', 'monthly'].
 */
export async function fetchFutureEntries(): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      inArray(entries.logType, ['future', 'monthly']),
      gte(entries.date, currentMonthStart)
    ),
    orderBy: [asc(entries.date), asc(entries.position)],
  });

  return data.map(mapEntryFromDb);
}

export async function fetchAssignedDays(monthlyEntryId: string): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, monthlyEntryId),
      eq(entries.logType, 'daily')
    ),
    columns: { date: true },
  });

  return data.map(d => d.date);
}

/**
 * Fetch unassigned monthly tasks for a given month.
 * "Unassigned" = has no daily children (via monthly_id).
 * Only tasks, only open status, only log_type IN ['monthly', 'future'].
 */
export async function fetchUnassignedMonthlyTasks(year: number, month: number): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${monthStr}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${monthStr}-${String(endDate.getDate()).padStart(2, '0')}`;

  const monthlyTasks = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      inArray(entries.logType, ['monthly', 'future']),
      eq(entries.type, 'task'),
      eq(entries.status, 'open'),
      gte(entries.date, start),
      lte(entries.date, end)
    ),
    orderBy: asc(entries.position),
  });

  if (monthlyTasks.length === 0) return [];

  const ids = monthlyTasks.map(t => t.id);
  
  // Find which ones have children
  const children = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      inArray(entries.monthlyId, ids),
      eq(entries.logType, 'daily')
    ),
    columns: { monthlyId: true },
  });

  const assignedIds = new Set(children.map(c => c.monthlyId));
  return monthlyTasks.filter(t => !assignedIds.has(t.id)).map(mapEntryFromDb);
}

/**
 * For migrated entries, check if any entry in the same chain (task_uid)
 * has been resolved (done/cancelled). Works across months.
 */
export async function fetchChainResolutions(taskUids: string[]): Promise<Record<string, EntryStatus>> {
  if (taskUids.length === 0) return {};

  const userId = await getCurrentUserId();
  if (!userId) return {};

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      inArray(entries.taskUid, taskUids),
      inArray(entries.status, ['done', 'cancelled'])
    ),
    columns: { taskUid: true, status: true },
  });

  const map: Record<string, EntryStatus> = {};
  for (const row of data) {
    if (row.taskUid && !map[row.taskUid]) {
      map[row.taskUid] = row.status as EntryStatus;
    }
  }
  return map;
}

export async function fetchIncompleteFromPast(beforeDate: string): Promise<Entry[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const data = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.logType, 'daily'),
      eq(entries.type, 'task'),
      eq(entries.status, 'open'),
      lt(entries.date, beforeDate)
    ),
    orderBy: asc(entries.date),
  });

  return data.map(mapEntryFromDb);
}

// ── CRUD helpers ──

/**
 * Create an entry. When type='task' AND log_type='daily', auto-creates a monthly
 * parent entry (D23) with the same task_uid and links via monthly_id.
 */
export async function createEntry(params: {
  type: EntryType;
  content: string;
  log_type: string;
  date: string;
  position: number;
  monthly_id?: string | null;
  task_uid?: string | null;
}): Promise<Entry | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  let monthlyId = params.monthly_id ?? null;
  let taskUid = params.task_uid ?? null;

  // D23: Auto-create monthly parent for daily tasks (unless already has a monthly_id)
  if (params.type === 'task' && params.log_type === 'daily' && !monthlyId) {
    const year = parseInt(params.date.slice(0, 4));
    const month = parseInt(params.date.slice(5, 7));
    const existingMonthly = await fetchMonthlyEntries(year, month);

    // Generate a shared task_uid for the chain
    const sharedUid = crypto.randomUUID();

    const [monthlyEntry] = await db.insert(entries).values({
      userId,
      type: 'task',
      content: params.content,
      logType: 'monthly',
      date: params.date,
      position: existingMonthly.length,
      status: 'open',
      taskUid: sharedUid,
    }).returning();

    if (monthlyEntry) {
      monthlyId = monthlyEntry.id;
      taskUid = sharedUid;
    }
  }

  const insertData: typeof entries.$inferInsert = {
    userId,
    type: params.type,
    content: params.content,
    logType: params.log_type as 'daily' | 'monthly' | 'future' | 'collection',
    date: params.date,
    position: params.position,
    monthlyId,
  };

  // Set task_uid if provided (from migration or D23), otherwise let DB default
  if (taskUid) {
    insertData.taskUid = taskUid;
  }

  const [data] = await db.insert(entries).values(insertData).returning();
  
  if (!data) return null;
  return mapEntryFromDb(data);
}

export async function updateEntry(id: string, updates: Partial<Entry>): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const result = await db.update(entries)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)));

  return result.rowCount !== null && result.rowCount > 0;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const result = await db.delete(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, userId)));

  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Delete an entry and ALL entries in the same chain (same task_uid).
 * One delete kills the entire history across all months.
 */
export async function deleteEntryWithSync(id: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, userId)),
    columns: { id: true, taskUid: true },
  });

  if (!entry) return false;

  // Nuclear delete: all entries with the same task_uid
  await db.delete(entries)
    .where(and(eq(entries.taskUid, entry.taskUid), eq(entries.userId, userId)));

  return true;
}

/**
 * Update an entry's content and sync to linked entries via monthly_id.
 * Migrated entries are read-only.
 */
export async function updateEntryWithSync(id: string, updates: Partial<Entry>): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, userId)),
    columns: { id: true, monthlyId: true, status: true },
  });

  if (!entry) return false;
  if (entry.status === 'migrated') return false;

  const ok = await updateEntry(id, updates);
  if (!ok) return false;

  const syncFields: Partial<typeof entries.$inferInsert> = {};
  if (updates.content !== undefined) syncFields.content = updates.content;
  if (updates.type !== undefined) syncFields.type = updates.type;

  if (Object.keys(syncFields).length === 0) return true;

  // Sync to monthly parent
  if (entry.monthlyId) {
    const parent = await db.query.entries.findFirst({
      where: and(eq(entries.id, entry.monthlyId), eq(entries.userId, userId)),
      columns: { id: true, status: true },
    });
    if (parent && parent.status !== 'migrated') {
      await db.update(entries)
        .set({ ...syncFields, updatedAt: new Date() })
        .where(and(eq(entries.id, parent.id), eq(entries.userId, userId)));
    }
  }

  // Sync to non-migrated daily children
  const children = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, id),
      eq(entries.logType, 'daily')
    ),
    columns: { id: true, status: true },
  });

  for (const child of children) {
    if (child.status !== 'migrated') {
      await db.update(entries)
        .set({ ...syncFields, updatedAt: new Date() })
        .where(and(eq(entries.id, child.id), eq(entries.userId, userId)));
    }
  }

  return true;
}

// ── Explicit action functions ──

export async function completeEntry(id: string): Promise<boolean> {
  return updateEntry(id, { status: 'done' });
}

export async function cancelEntry(id: string): Promise<boolean> {
  return updateEntry(id, { status: 'cancelled' });
}

/**
 * Plan a monthly task to a specific day.
 * Creates daily child with same task_uid. Does NOT change monthly parent status.
 */
export async function planToDay(monthlyEntryId: string, date: string): Promise<Entry | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  // Check for existing non-migrated children
  const existingChildren = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, monthlyEntryId),
      eq(entries.logType, 'daily'),
      ne(entries.status, 'migrated')
    ),
  });

  if (existingChildren.length > 0) {
    const child = existingChildren[0];
    await updateEntry(child.id, { date });
    await updateEntry(monthlyEntryId, { date });
    return { ...mapEntryFromDb(child), date };
  }

  const monthly = await db.query.entries.findFirst({
    where: and(eq(entries.id, monthlyEntryId), eq(entries.userId, userId)),
  });

  if (!monthly) return null;

  const existing = await fetchEntriesForDate(date);

  const [dailyEntry] = await db.insert(entries).values({
    userId,
    type: monthly.type,
    content: monthly.content,
    logType: 'daily',
    date,
    position: existing.length,
    monthlyId: monthlyEntryId,
    taskUid: monthly.taskUid,  // same chain
  }).returning();

  if (!dailyEntry) return null;

  await updateEntry(monthlyEntryId, { date });
  return mapEntryFromDb(dailyEntry);
}

// ── Migration helpers ──

/**
 * Migrate a daily task to a different day in the SAME month.
 * All entries share the same task_uid throughout.
 */
export async function migrateEntry(id: string, newDate: string): Promise<Entry | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const original = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, userId)),
  });

  if (!original) return null;

  const origMonth = original.date.slice(0, 7);
  const newMonth = newDate.slice(0, 7);

  if (origMonth !== newMonth) {
    const targetMonthDate = newDate.slice(0, 7) + '-01';
    return migrateToMonth(id, targetMonthDate);
  }

  const monthlyId = original.monthlyId;
  if (!monthlyId) {
    console.warn('migrateEntry: daily task without monthly_id', id);
    return null;
  }

  // Step 1: Check if a peer exists at target date
  const peerAtTarget = await db.query.entries.findFirst({
    where: and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, monthlyId),
      eq(entries.logType, 'daily'),
      eq(entries.date, newDate)
    ),
  });

  let result: Entry;

  if (peerAtTarget) {
    await updateEntry(peerAtTarget.id, { status: 'open' });
    result = { ...mapEntryFromDb(peerAtTarget), status: 'open' };
  } else {
    const existing = await fetchEntriesForDate(newDate);

    const [newEntry] = await db.insert(entries).values({
      userId,
      type: original.type,
      content: original.content,
      logType: 'daily',
      date: newDate,
      position: existing.length,
      monthlyId,
      taskUid: original.taskUid,  // same chain
    }).returning();

    if (!newEntry) return null;
    result = mapEntryFromDb(newEntry);
  }

  // Step 2: Delete all peers with dates AFTER target date
  await db.delete(entries)
    .where(and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, monthlyId),
      eq(entries.logType, 'daily'),
      gt(entries.date, newDate),
      ne(entries.id, result.id)
    ));

  // Step 3: Mark source as migrated if it still exists
  if (original.id !== result.id && original.date < newDate) {
    const sourceStillExists = await db.query.entries.findFirst({
      where: and(eq(entries.id, original.id), eq(entries.userId, userId)),
      columns: { id: true },
    });
    if (sourceStillExists) {
      await updateEntry(original.id, { status: 'migrated' });
    }
  } else if (original.id !== result.id && original.date >= newDate) {
    const sourceStillExists = await db.query.entries.findFirst({
      where: and(eq(entries.id, original.id), eq(entries.userId, userId)),
      columns: { id: true },
    });
    if (sourceStillExists) {
      await deleteEntry(original.id);
    }
  }

  // Step 4: Update monthly parent date
  await updateEntry(monthlyId, { date: newDate });

  return result;
}

/**
 * Migrate an entry to a different month.
 * Marks old chain as migrated. Creates new monthly entry with SAME task_uid.
 */
export async function migrateToMonth(entryId: string, targetMonthDate: string): Promise<Entry | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const original = await db.query.entries.findFirst({
    where: and(eq(entries.id, entryId), eq(entries.userId, userId)),
  });

  if (!original) return null;

  const monthlyId = original.monthlyId;

  if (monthlyId) {
    // Daily entry — mark all peers + self as migrated
    await db.update(entries)
      .set({ status: 'migrated', updatedAt: new Date() })
      .where(and(
        eq(entries.userId, userId),
        eq(entries.monthlyId, monthlyId),
        eq(entries.logType, 'daily')
      ));
    await updateEntry(monthlyId, { status: 'migrated' });
  } else if (original.logType === 'monthly' || original.logType === 'future') {
    // Monthly/future entry — mark children as migrated
    await db.update(entries)
      .set({ status: 'migrated', updatedAt: new Date() })
      .where(and(
        eq(entries.userId, userId),
        eq(entries.monthlyId, original.id),
        eq(entries.logType, 'daily')
      ));
    await updateEntry(entryId, { status: 'migrated' });
  } else {
    await updateEntry(entryId, { status: 'migrated' });
  }

  const targetYear = parseInt(targetMonthDate.slice(0, 4));
  const targetMonth = parseInt(targetMonthDate.slice(5, 7));
  const existingInTarget = await fetchMonthlyEntries(targetYear, targetMonth);

  // New monthly entry: same task_uid, unlinked (no monthly_id), YYYY-MM-01
  const [newEntry] = await db.insert(entries).values({
    userId,
    type: original.type,
    content: original.content,
    logType: 'monthly',
    date: targetMonthDate.slice(0, 7) + '-01',
    position: existingInTarget.length,
    status: 'open',
    taskUid: original.taskUid,  // SAME chain — never breaks
  }).returning();

  if (!newEntry) return null;
  return mapEntryFromDb(newEntry);
}

/**
 * Migrate all incomplete past tasks to today.
 */
export async function migrateAllIncomplete(fromBefore: string, toDate: string): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const incomplete = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.logType, 'daily'),
      eq(entries.type, 'task'),
      eq(entries.status, 'open'),
      lt(entries.date, fromBefore)
    ),
    orderBy: asc(entries.date),
  });

  if (incomplete.length === 0) return 0;

  let count = 0;
  for (const entry of incomplete) {
    const result = await migrateEntry(entry.id, toDate);
    if (result) count++;
  }
  return count;
}

// ── Bidirectional sync ──

export async function syncStatusToParent(dailyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const daily = await db.query.entries.findFirst({
    where: and(eq(entries.id, dailyEntryId), eq(entries.userId, userId)),
    columns: { monthlyId: true },
  });

  if (!daily?.monthlyId) return false;

  // Sync to all non-migrated peer dailies
  const peers = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, daily.monthlyId),
      eq(entries.logType, 'daily'),
      ne(entries.id, dailyEntryId)
    ),
    columns: { id: true, status: true },
  });

  for (const peer of peers) {
    if (peer.status !== 'migrated') {
      await updateEntry(peer.id, { status: newStatus });
    }
  }

  return updateEntry(daily.monthlyId, { status: newStatus });
}

export async function syncStatusToChild(monthlyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const children = await db.query.entries.findMany({
    where: and(
      eq(entries.userId, userId),
      eq(entries.monthlyId, monthlyEntryId),
      eq(entries.logType, 'daily')
    ),
    columns: { id: true, status: true },
  });

  if (children.length === 0) return false;

  let ok = true;
  for (const child of children) {
    if (child.status !== 'migrated') {
      const result = await updateEntry(child.id, { status: newStatus });
      if (!result) ok = false;
    }
  }
  return ok;
}

export async function assignMonthlyTaskToDay(
  monthlyEntry: Entry,
  day: number,
  year: number,
  month: number
): Promise<Entry | null> {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return planToDay(monthlyEntry.id, dateStr);
}

// ── Helper to map DB entry to Entry type ──

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
