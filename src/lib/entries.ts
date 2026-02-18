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
  task: '•',
  event: '⚬',
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

export async function fetchMonthlyEntries(year: number, month: number): Promise<Entry[]> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .in('log_type', ['monthly', 'future'])
    .eq('date', monthStr)
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

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
    .eq('parent_id', monthlyEntryId)
    .eq('log_type', 'daily');
  return (data ?? []).map((d: { date: string }) => d.date);
}

export async function fetchUnassignedMonthlyTasks(year: number, month: number): Promise<Entry[]> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'monthly')
    .eq('date', monthStr)
    .eq('type', 'task')
    .in('status', ['open'])
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
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
 * parent entry (D23) and links via parent_id.
 */
export async function createEntry(params: {
  type: EntryType;
  content: string;
  log_type: string;
  date: string;
  position: number;
  parent_id?: string | null;
}): Promise<Entry | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  // D23: Auto-create monthly parent for daily tasks (unless already has a parent_id, e.g. from planToDay)
  let parentId = params.parent_id ?? null;
  if (params.type === 'task' && params.log_type === 'daily' && !parentId) {
    const monthStr = params.date.slice(0, 7) + '-01';
    // Get position in monthly
    const year = parseInt(params.date.slice(0, 4));
    const month = parseInt(params.date.slice(5, 7));
    const existingMonthly = await fetchMonthlyEntries(year, month);

    const { data: monthlyEntry, error: monthlyError } = await supabase()
      .from('entries')
      .insert({
        user_id: user.id,
        type: 'task',
        content: params.content,
        log_type: 'monthly',
        date: monthStr,
        position: existingMonthly.length,
        status: 'migrated',
      })
      .select()
      .single();

    if (!monthlyError && monthlyEntry) {
      parentId = monthlyEntry.id;
    }
  }

  const { data, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: params.type,
      content: params.content,
      log_type: params.log_type,
      date: params.date,
      position: params.position,
      parent_id: parentId,
    })
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
 * Delete an entry and any linked parent/child entries (bidirectional).
 */
export async function deleteEntryWithSync(id: string): Promise<boolean> {
  const { data: entry } = await supabase()
    .from('entries')
    .select('id, parent_id')
    .eq('id', id)
    .single();

  if (!entry) return false;

  // If this entry has a parent (daily → monthly link), delete the parent too
  if (entry.parent_id) {
    await supabase().from('entries').delete().eq('id', entry.parent_id);
  }

  // Delete any children (monthly → daily link)
  await supabase().from('entries').delete().eq('parent_id', id);

  // Delete the entry itself
  const { error } = await supabase().from('entries').delete().eq('id', id);
  return !error;
}

/**
 * Update an entry's content and sync to any linked parent/child entries.
 */
export async function updateEntryWithSync(id: string, updates: Partial<Entry>): Promise<boolean> {
  const ok = await updateEntry(id, updates);
  if (!ok) return false;

  const syncFields: Partial<Entry> = {};
  if (updates.content !== undefined) syncFields.content = updates.content;
  if (updates.type !== undefined) syncFields.type = updates.type;

  if (Object.keys(syncFields).length === 0) return true;

  const { data: entry } = await supabase()
    .from('entries')
    .select('id, parent_id')
    .eq('id', id)
    .single();

  if (!entry) return true;

  if (entry.parent_id) {
    await updateEntry(entry.parent_id, syncFields);
  }

  const { data: children } = await supabase()
    .from('entries')
    .select('id')
    .eq('parent_id', id);

  if (children) {
    for (const child of children) {
      await updateEntry(child.id, syncFields);
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
 * MAX ONE day per monthly task — if already planned, update the existing daily entry's date.
 */
export async function planToDay(monthlyEntryId: string, date: string): Promise<Entry | null> {
  const { data: existingChildren } = await supabase()
    .from('entries')
    .select('*')
    .eq('parent_id', monthlyEntryId)
    .eq('log_type', 'daily');

  if (existingChildren && existingChildren.length > 0) {
    const child = existingChildren[0];
    const ok = await updateEntry(child.id, { date });
    if (ok) {
      await updateEntry(monthlyEntryId, { status: 'migrated' });
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

  const dailyEntry = await createEntry({
    type: monthly.type,
    content: monthly.content,
    log_type: 'daily',
    date,
    position: existing.length,
    parent_id: monthlyEntryId,
  });

  if (dailyEntry) {
    await updateEntry(monthlyEntryId, { status: 'migrated' });
  }

  return dailyEntry;
}

// ── Migration helpers ──

/**
 * Migrate a daily entry to a different day in the same month.
 * Reuses existing monthly parent. If no monthly parent, creates one (defensive).
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

  if (origMonth === newMonth && original.parent_id) {
    // Same month with existing monthly parent: just update the daily entry's date
    await updateEntry(id, { date: newDate });
    // Return updated entry
    return { ...original, date: newDate } as Entry;
  }

  // Different month or no parent — mark old as migrated and create new
  await updateEntry(id, { status: 'migrated' });

  // If old entry had a monthly parent and we're moving to different month,
  // mark old monthly parent as migrated too
  if (original.parent_id && origMonth !== newMonth) {
    await updateEntry(original.parent_id, { status: 'migrated' });
  }

  const existing = await fetchEntriesForDate(newDate);
  // createEntry will auto-create monthly parent for the new month (D23)
  return createEntry({
    type: original.type,
    content: original.content,
    log_type: 'daily',
    date: newDate,
    position: existing.length,
  });
}

/**
 * Migrate an entry to a different month.
 * Marks current daily + monthly parent as migrated.
 * Creates new monthly entry in target month (no daily entry — user plans to day later).
 */
export async function migrateToMonth(entryId: string, targetMonthDate: string): Promise<Entry | null> {
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (!original) return null;

  // Mark daily entry as migrated
  await updateEntry(entryId, { status: 'migrated' });

  // Mark monthly parent as migrated if exists
  if (original.parent_id) {
    await updateEntry(original.parent_id, { status: 'migrated' });
  }

  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  // Get position in target month
  const targetYear = parseInt(targetMonthDate.slice(0, 4));
  const targetMonth = parseInt(targetMonthDate.slice(5, 7));
  const existingInTarget = await fetchMonthlyEntries(targetYear, targetMonth);

  // Create new monthly entry in target month (unlinked)
  const { data: newEntry, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: original.type,
      content: original.content,
      log_type: 'monthly',
      date: targetMonthDate,
      position: existingInTarget.length,
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
    .select('parent_id')
    .eq('id', dailyEntryId)
    .single();

  if (!daily?.parent_id) return false;

  return updateEntry(daily.parent_id, { status: newStatus });
}

export async function syncStatusToChild(monthlyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const { data: children } = await supabase()
    .from('entries')
    .select('id')
    .eq('parent_id', monthlyEntryId)
    .eq('log_type', 'daily');

  if (!children || children.length === 0) return false;

  let ok = true;
  for (const child of children) {
    const result = await updateEntry(child.id, { status: newStatus });
    if (!result) ok = false;
  }
  return ok;
}

// Keep for backward compat with pull-from-monthly
export async function assignMonthlyTaskToDay(
  monthlyEntry: Entry,
  day: number,
  year: number,
  month: number
): Promise<Entry | null> {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return planToDay(monthlyEntry.id, dateStr);
}
