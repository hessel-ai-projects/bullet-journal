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
  scheduled: '<',
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
  
  const { data, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: params.type,
      content: params.content,
      log_type: params.log_type,
      date: params.date,
      position: params.position,
      parent_id: params.parent_id ?? null,
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
  // Get the entry to check for links
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

  // Only sync content/type changes, not status (status has its own sync)
  const syncFields: Partial<Entry> = {};
  if (updates.content !== undefined) syncFields.content = updates.content;
  if (updates.type !== undefined) syncFields.type = updates.type;

  if (Object.keys(syncFields).length === 0) return true;

  // Get the entry to check for links
  const { data: entry } = await supabase()
    .from('entries')
    .select('id, parent_id')
    .eq('id', id)
    .single();

  if (!entry) return true;

  // Sync to parent if exists
  if (entry.parent_id) {
    await updateEntry(entry.parent_id, syncFields);
  }

  // Sync to children if any
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
  // Check if a daily child already exists
  const { data: existingChildren } = await supabase()
    .from('entries')
    .select('*')
    .eq('parent_id', monthlyEntryId)
    .eq('log_type', 'daily');

  if (existingChildren && existingChildren.length > 0) {
    // Update existing daily entry's date instead of creating new
    const child = existingChildren[0];
    const ok = await updateEntry(child.id, { date });
    if (ok) {
      await updateEntry(monthlyEntryId, { status: 'migrated' });
      return { ...child, date } as Entry;
    }
    return null;
  }

  // Get the monthly entry
  const { data: monthly } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', monthlyEntryId)
    .single();

  if (!monthly) return null;

  // Get position for the target date
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

/**
 * Move an entry to another month. Sets status to 'scheduled', creates a copy in the target month.
 */
export async function moveToMonth(entryId: string, targetMonthDate: string): Promise<Entry | null> {
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (!original) return null;

  // Determine log_type based on how far the target is
  const logType = original.log_type === 'future' ? 'future' : 'monthly';

  // Get position in target month
  const targetYear = parseInt(targetMonthDate.slice(0, 4));
  const targetMonth = parseInt(targetMonthDate.slice(5, 7));
  const existingInTarget = await fetchMonthlyEntries(targetYear, targetMonth);

  const newEntry = await createEntry({
    type: original.type,
    content: original.content,
    log_type: logType,
    date: targetMonthDate,
    position: existingInTarget.length,
  });

  if (newEntry) {
    await updateEntry(entryId, { status: 'scheduled' });
  }

  return newEntry;
}

// ── Bidirectional sync ──

/**
 * When a daily entry's status changes, sync to its parent monthly entry (via parent_id).
 */
export async function syncStatusToParent(dailyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const { data: daily } = await supabase()
    .from('entries')
    .select('parent_id')
    .eq('id', dailyEntryId)
    .single();

  if (!daily?.parent_id) return false;

  return updateEntry(daily.parent_id, { status: newStatus });
}

/**
 * When a monthly entry's status changes, sync to any linked daily entry.
 */
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

// ── Migration helpers ──

export async function migrateEntry(id: string, newDate: string): Promise<Entry | null> {
  await updateEntry(id, { status: 'migrated' });
  
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!original) return null;
  
  return createEntry({
    type: original.type,
    content: original.content,
    log_type: 'daily',
    date: newDate,
    position: 9999,
  });
}

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
