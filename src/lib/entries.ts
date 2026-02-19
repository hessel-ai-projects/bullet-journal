import { createClient } from '@/lib/supabase/client';
import type { Entry, EntryType, EntryStatus } from '@/lib/types';

const supabase = () => createClient();

export function parseEntryPrefix(raw: string): { type: EntryType; content: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('- ')) return { type: 'note', content: trimmed.slice(2) };
  if (trimmed.startsWith('* ')) return { type: 'event', content: trimmed.slice(2) };
  return { type: 'task', content: trimmed };
}

export const bulletSymbol: Record<EntryType, string> = {
  task: '●',
  event: '○',
  note: '–',
};

export const statusSymbol: Record<EntryStatus, string> = {
  open: '',
  done: '×',
  migrated: '>',
  cancelled: '',
};

// ── Fetch helpers ──

export async function fetchEntriesForDate(date: string): Promise<Entry[]> {
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'daily')
    .eq('date', date)
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

export async function fetchEntriesForMonth(year: number, month: number): Promise<Entry[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'daily')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

/**
 * Fetch monthly-level entries for a given month.
 * Queries log_type IN ['monthly', 'future'] — both appear in the monthly panel.
 */
export async function fetchMonthlyEntries(year: number, month: number): Promise<Entry[]> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${monthStr}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${monthStr}-${String(endDate.getDate()).padStart(2, '0')}`;
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .in('log_type', ['monthly', 'future'])
    .gte('date', start)
    .lte('date', end)
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

/**
 * Fetch future log entries. Queries log_type IN ['future', 'monthly'].
 */
export async function fetchFutureEntries(): Promise<Entry[]> {
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .in('log_type', ['future', 'monthly'])
    .order('date', { ascending: true })
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

export async function fetchAssignedDays(monthlyEntryId: string): Promise<string[]> {
  const { data } = await supabase()
    .from('entries')
    .select('date')
    .eq('monthly_id', monthlyEntryId)
    .eq('log_type', 'daily');
  return (data ?? []).map((d: { date: string }) => d.date);
}

/**
 * Fetch unassigned monthly tasks for a given month.
 * "Unassigned" = has no daily children (via monthly_id).
 * Only tasks, only open status, only log_type IN ['monthly', 'future'].
 */
export async function fetchUnassignedMonthlyTasks(year: number, month: number): Promise<Entry[]> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${monthStr}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${monthStr}-${String(endDate.getDate()).padStart(2, '0')}`;
  
  const { data: monthlyTasks } = await supabase()
    .from('entries')
    .select('*')
    .in('log_type', ['monthly', 'future'])
    .eq('type', 'task')
    .eq('status', 'open')
    .gte('date', start)
    .lte('date', end)
    .order('position', { ascending: true });

  if (!monthlyTasks || monthlyTasks.length === 0) return [];

  const ids = monthlyTasks.map(t => t.id);
  const { data: children } = await supabase()
    .from('entries')
    .select('monthly_id')
    .in('monthly_id', ids)
    .eq('log_type', 'daily');

  const assignedIds = new Set((children ?? []).map(c => c.monthly_id));
  return monthlyTasks.filter(t => !assignedIds.has(t.id)) as Entry[];
}

/**
 * For migrated entries, check if any entry in the same chain (task_uid)
 * has been resolved (done/cancelled). Works across months.
 */
export async function fetchChainResolutions(taskUids: string[]): Promise<Record<string, EntryStatus>> {
  if (taskUids.length === 0) return {};
  const { data } = await supabase()
    .from('entries')
    .select('task_uid, status')
    .in('task_uid', taskUids)
    .in('status', ['done', 'cancelled']);
  const map: Record<string, EntryStatus> = {};
  for (const row of (data ?? [])) {
    if (row.task_uid && !map[row.task_uid]) {
      map[row.task_uid] = row.status as EntryStatus;
    }
  }
  return map;
}

export async function fetchIncompleteFromPast(beforeDate: string): Promise<Entry[]> {
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'daily')
    .eq('type', 'task')
    .eq('status', 'open')
    .lt('date', beforeDate)
    .order('date', { ascending: true });
  return (data ?? []) as Entry[];
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
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  let monthlyId = params.monthly_id ?? null;
  let taskUid = params.task_uid ?? null;

  // D23: Auto-create monthly parent for daily tasks (unless already has a monthly_id)
  if (params.type === 'task' && params.log_type === 'daily' && !monthlyId) {
    const year = parseInt(params.date.slice(0, 4));
    const month = parseInt(params.date.slice(5, 7));
    const existingMonthly = await fetchMonthlyEntries(year, month);

    // Generate a shared task_uid for the chain
    const sharedUid = crypto.randomUUID();

    const { data: monthlyEntry, error: monthlyError } = await supabase()
      .from('entries')
      .insert({
        user_id: user.id,
        type: 'task',
        content: params.content,
        log_type: 'monthly',
        date: params.date,
        position: existingMonthly.length,
        status: 'open',
        task_uid: sharedUid,
      })
      .select()
      .single();

    if (!monthlyError && monthlyEntry) {
      monthlyId = monthlyEntry.id;
      taskUid = sharedUid;
    }
  }

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    type: params.type,
    content: params.content,
    log_type: params.log_type,
    date: params.date,
    position: params.position,
    monthly_id: monthlyId,
  };

  // Set task_uid if provided (from migration or D23), otherwise let DB default
  if (taskUid) {
    insertData.task_uid = taskUid;
  }

  const { data, error } = await supabase()
    .from('entries')
    .insert(insertData)
    .select()
    .single();
  
  if (error) return null;
  return data as Entry;
}

export async function updateEntry(id: string, updates: Partial<Entry>): Promise<boolean> {
  const { error } = await supabase()
    .from('entries')
    .update(updates)
    .eq('id', id);
  return !error;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const { error } = await supabase()
    .from('entries')
    .delete()
    .eq('id', id);
  return !error;
}

/**
 * Delete an entry and ALL entries in the same chain (same task_uid).
 * One delete kills the entire history across all months.
 */
export async function deleteEntryWithSync(id: string): Promise<boolean> {
  const { data: entry } = await supabase()
    .from('entries')
    .select('id, task_uid')
    .eq('id', id)
    .single();

  if (!entry) return false;

  // Nuclear delete: all entries with the same task_uid
  const { error } = await supabase()
    .from('entries')
    .delete()
    .eq('task_uid', entry.task_uid);

  return !error;
}

/**
 * Update an entry's content and sync to linked entries via monthly_id.
 * Migrated entries are read-only.
 */
export async function updateEntryWithSync(id: string, updates: Partial<Entry>): Promise<boolean> {
  const { data: entry } = await supabase()
    .from('entries')
    .select('id, monthly_id, status')
    .eq('id', id)
    .single();

  if (!entry) return false;
  if (entry.status === 'migrated') return false;

  const ok = await updateEntry(id, updates);
  if (!ok) return false;

  const syncFields: Partial<Entry> = {};
  if (updates.content !== undefined) syncFields.content = updates.content;
  if (updates.type !== undefined) syncFields.type = updates.type;

  if (Object.keys(syncFields).length === 0) return true;

  // Sync to monthly parent
  if (entry.monthly_id) {
    const { data: parent } = await supabase()
      .from('entries')
      .select('status')
      .eq('id', entry.monthly_id)
      .single();
    if (parent && parent.status !== 'migrated') {
      await updateEntry(entry.monthly_id, syncFields);
    }
  }

  // Sync to non-migrated daily children
  const { data: children } = await supabase()
    .from('entries')
    .select('id, status')
    .eq('monthly_id', id);

  if (children) {
    for (const child of children) {
      if (child.status !== 'migrated') {
        await updateEntry(child.id, syncFields);
      }
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
  const { data: existingChildren } = await supabase()
    .from('entries')
    .select('*')
    .eq('monthly_id', monthlyEntryId)
    .eq('log_type', 'daily')
    .neq('status', 'migrated');

  if (existingChildren && existingChildren.length > 0) {
    const child = existingChildren[0];
    const ok = await updateEntry(child.id, { date });
    if (ok) {
      await updateEntry(monthlyEntryId, { date });
      return { ...child, date } as Entry;
    }
    return null;
  }

  const { data: monthly } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', monthlyEntryId)
    .single();

  if (!monthly) return null;

  const existing = await fetchEntriesForDate(date);
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  const { data: dailyEntry, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: monthly.type,
      content: monthly.content,
      log_type: 'daily',
      date,
      position: existing.length,
      monthly_id: monthlyEntryId,
      task_uid: monthly.task_uid,  // same chain
    })
    .select()
    .single();

  if (error) return null;

  await updateEntry(monthlyEntryId, { date });
  return dailyEntry as Entry;
}

// ── Migration helpers ──

/**
 * Migrate a daily task to a different day in the SAME month.
 * All entries share the same task_uid throughout.
 */
export async function migrateEntry(id: string, newDate: string): Promise<Entry | null> {
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', id)
    .single();

  if (!original) return null;

  const origMonth = original.date.slice(0, 7);
  const newMonth = newDate.slice(0, 7);

  if (origMonth !== newMonth) {
    const targetMonthDate = newDate.slice(0, 7) + '-01';
    return migrateToMonth(id, targetMonthDate);
  }

  const monthlyId = original.monthly_id;
  if (!monthlyId) {
    console.warn('migrateEntry: daily task without monthly_id', id);
    return null;
  }

  // Step 1: Check if a peer exists at target date
  const { data: peerAtTarget } = await supabase()
    .from('entries')
    .select('*')
    .eq('monthly_id', monthlyId)
    .eq('log_type', 'daily')
    .eq('date', newDate)
    .single();

  let result: Entry;

  if (peerAtTarget) {
    await updateEntry(peerAtTarget.id, { status: 'open' });
    result = { ...peerAtTarget, status: 'open' } as Entry;
  } else {
    const existing = await fetchEntriesForDate(newDate);
    const { data: { user } } = await supabase().auth.getUser();
    if (!user) return null;

    const { data: newEntry, error } = await supabase()
      .from('entries')
      .insert({
        user_id: user.id,
        type: original.type,
        content: original.content,
        log_type: 'daily',
        date: newDate,
        position: existing.length,
        monthly_id: monthlyId,
        task_uid: original.task_uid,  // same chain
      })
      .select()
      .single();

    if (error || !newEntry) return null;
    result = newEntry as Entry;
  }

  // Step 2: Delete all peers with dates AFTER target date
  await supabase()
    .from('entries')
    .delete()
    .eq('monthly_id', monthlyId)
    .eq('log_type', 'daily')
    .gt('date', newDate)
    .neq('id', result.id);

  // Step 3: Mark source as migrated if it still exists
  if (original.id !== result.id && original.date < newDate) {
    const { data: sourceStillExists } = await supabase()
      .from('entries')
      .select('id')
      .eq('id', original.id)
      .single();
    if (sourceStillExists) {
      await updateEntry(original.id, { status: 'migrated' });
    }
  } else if (original.id !== result.id && original.date >= newDate) {
    const { data: sourceStillExists } = await supabase()
      .from('entries')
      .select('id')
      .eq('id', original.id)
      .single();
    if (sourceStillExists) {
      await supabase().from('entries').delete().eq('id', original.id);
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
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (!original) return null;

  const monthlyId = original.monthly_id;

  if (monthlyId) {
    // Daily entry — mark all peers + self as migrated
    await supabase()
      .from('entries')
      .update({ status: 'migrated' })
      .eq('monthly_id', monthlyId)
      .eq('log_type', 'daily');
    await updateEntry(monthlyId, { status: 'migrated' });
  } else if (original.log_type === 'monthly' || original.log_type === 'future') {
    // Monthly/future entry — mark children as migrated
    await supabase()
      .from('entries')
      .update({ status: 'migrated' })
      .eq('monthly_id', original.id)
      .eq('log_type', 'daily');
    await updateEntry(entryId, { status: 'migrated' });
  } else {
    await updateEntry(entryId, { status: 'migrated' });
  }

  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  const targetYear = parseInt(targetMonthDate.slice(0, 4));
  const targetMonth = parseInt(targetMonthDate.slice(5, 7));
  const existingInTarget = await fetchMonthlyEntries(targetYear, targetMonth);

  // New monthly entry: same task_uid, unlinked (no monthly_id), YYYY-MM-01
  const { data: newEntry, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: original.type,
      content: original.content,
      log_type: 'monthly',
      date: targetMonthDate.slice(0, 7) + '-01',
      position: existingInTarget.length,
      status: 'open',
      task_uid: original.task_uid,  // SAME chain — never breaks
    })
    .select()
    .single();

  if (error) return null;
  return newEntry as Entry;
}

/**
 * Migrate all incomplete past tasks to today.
 */
export async function migrateAllIncomplete(fromBefore: string, toDate: string): Promise<number> {
  const { data: incomplete } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'daily')
    .eq('type', 'task')
    .eq('status', 'open')
    .lt('date', fromBefore)
    .order('date', { ascending: true });
  
  if (!incomplete || incomplete.length === 0) return 0;
  
  let count = 0;
  for (const entry of incomplete) {
    const result = await migrateEntry(entry.id, toDate);
    if (result) count++;
  }
  return count;
}

// ── Bidirectional sync ──

export async function syncStatusToParent(dailyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const { data: daily } = await supabase()
    .from('entries')
    .select('monthly_id')
    .eq('id', dailyEntryId)
    .single();

  if (!daily?.monthly_id) return false;

  // Sync to all non-migrated peer dailies
  const { data: peers } = await supabase()
    .from('entries')
    .select('id, status')
    .eq('monthly_id', daily.monthly_id)
    .eq('log_type', 'daily')
    .neq('id', dailyEntryId);

  if (peers) {
    for (const peer of peers) {
      if (peer.status !== 'migrated') {
        await updateEntry(peer.id, { status: newStatus });
      }
    }
  }

  return updateEntry(daily.monthly_id, { status: newStatus });
}

export async function syncStatusToChild(monthlyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const { data: children } = await supabase()
    .from('entries')
    .select('id, status')
    .eq('monthly_id', monthlyEntryId)
    .eq('log_type', 'daily');

  if (!children || children.length === 0) return false;

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
