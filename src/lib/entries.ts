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
 * Only queries log_type='monthly' (NOT 'future').
 */
export async function fetchMonthlyEntries(year: number, month: number): Promise<Entry[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'monthly')
    .gte('date', start)
    .lte('date', end)
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

/**
 * Fetch future log entries. Only queries log_type='future'.
 */
export async function fetchFutureEntries(): Promise<Entry[]> {
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'future')
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

/**
 * Fetch unassigned monthly tasks for a given month.
 * "Unassigned" = has no daily children (regardless of status).
 * Only tasks, only open status, only log_type='monthly'.
 */
export async function fetchUnassignedMonthlyTasks(year: number, month: number): Promise<Entry[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  
  // Get all open monthly tasks
  const { data: monthlyTasks } = await supabase()
    .from('entries')
    .select('*')
    .eq('log_type', 'monthly')
    .eq('type', 'task')
    .eq('status', 'open')
    .gte('date', start)
    .lte('date', end)
    .order('position', { ascending: true });

  if (!monthlyTasks || monthlyTasks.length === 0) return [];

  // Check which ones have daily children
  const ids = monthlyTasks.map(t => t.id);
  const { data: children } = await supabase()
    .from('entries')
    .select('parent_id')
    .in('parent_id', ids)
    .eq('log_type', 'daily');

  const assignedIds = new Set((children ?? []).map(c => c.parent_id));
  return monthlyTasks.filter(t => !assignedIds.has(t.id)) as Entry[];
}

/**
 * Fetch the current status of parent entries for a list of parent IDs.
 * Used to determine visual treatment of migrated daily entries.
 */
export async function fetchParentStatuses(parentIds: string[]): Promise<Record<string, EntryStatus>> {
  if (parentIds.length === 0) return {};
  const { data } = await supabase()
    .from('entries')
    .select('id, status')
    .in('id', parentIds);
  const map: Record<string, EntryStatus> = {};
  for (const row of (data ?? [])) {
    map[row.id] = row.status as EntryStatus;
  }
  return map;
}

/**
 * For migrated monthly entries, check if any of their daily children
 * have a resolved status (done/cancelled). Returns a map of monthly entry ID → resolved status.
 */
export async function fetchChildResolutions(monthlyIds: string[]): Promise<Record<string, EntryStatus>> {
  if (monthlyIds.length === 0) return {};
  const { data } = await supabase()
    .from('entries')
    .select('parent_id, status')
    .in('parent_id', monthlyIds)
    .eq('log_type', 'daily')
    .in('status', ['done', 'cancelled']);
  const map: Record<string, EntryStatus> = {};
  for (const row of (data ?? [])) {
    // If any child is done/cancelled, that's the resolution
    if (row.parent_id && !map[row.parent_id]) {
      map[row.parent_id] = row.status as EntryStatus;
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
 * parent entry (D23) and links via parent_id.
 * Monthly parent uses the ACTUAL date (not YYYY-MM-01) and status='open'.
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
    // Monthly parent uses actual date, status='open'
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
        date: params.date,  // actual date, not YYYY-MM-01
        position: existingMonthly.length,
        status: 'open',  // stays open (assignment = has daily child)
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
 * Delete an entry and any linked parent/child entries.
 * - Delete daily → delete monthly parent + ALL peer dailies with same parent_id
 * - Delete monthly → delete all daily children
 */
export async function deleteEntryWithSync(id: string): Promise<boolean> {
  const { data: entry } = await supabase()
    .from('entries')
    .select('id, parent_id, log_type')
    .eq('id', id)
    .single();

  if (!entry) return false;

  if (entry.log_type === 'daily' && entry.parent_id) {
    // Deleting a daily entry: delete monthly parent + all peer dailies with same parent
    // First delete all peers (daily entries with same parent_id)
    await supabase().from('entries').delete().eq('parent_id', entry.parent_id);
    // Then delete the monthly parent
    await supabase().from('entries').delete().eq('id', entry.parent_id);
    // The entry itself was already deleted as a peer (it has the same parent_id)
    return true;
  }

  // Deleting a monthly/future entry: delete all daily children
  await supabase().from('entries').delete().eq('parent_id', id);

  // Delete the entry itself
  const { error } = await supabase().from('entries').delete().eq('id', id);
  return !error;
}

/**
 * Update an entry's content and sync to any linked parent/child entries.
 * Migrated entries are read-only — no edits propagate from/to them.
 */
export async function updateEntryWithSync(id: string, updates: Partial<Entry>): Promise<boolean> {
  const { data: entry } = await supabase()
    .from('entries')
    .select('id, parent_id, status')
    .eq('id', id)
    .single();

  if (!entry) return false;

  // Don't allow edits on migrated entries
  if (entry.status === 'migrated') return false;

  const ok = await updateEntry(id, updates);
  if (!ok) return false;

  const syncFields: Partial<Entry> = {};
  if (updates.content !== undefined) syncFields.content = updates.content;
  if (updates.type !== undefined) syncFields.type = updates.type;

  if (Object.keys(syncFields).length === 0) return true;

  // Sync to parent (if this is a daily entry)
  if (entry.parent_id) {
    // Only sync to parent if parent is not migrated
    const { data: parent } = await supabase()
      .from('entries')
      .select('status')
      .eq('id', entry.parent_id)
      .single();
    if (parent && parent.status !== 'migrated') {
      await updateEntry(entry.parent_id, syncFields);
    }
  }

  // Sync to non-migrated children
  const { data: children } = await supabase()
    .from('entries')
    .select('id, status')
    .eq('parent_id', id);

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
 * Does NOT change the monthly parent's status — assignment is detected by having children.
 * MAX ONE active daily child per monthly task. If already planned, update the existing daily entry's date.
 */
export async function planToDay(monthlyEntryId: string, date: string): Promise<Entry | null> {
  const { data: existingChildren } = await supabase()
    .from('entries')
    .select('*')
    .eq('parent_id', monthlyEntryId)
    .eq('log_type', 'daily')
    .neq('status', 'migrated');  // only active children

  if (existingChildren && existingChildren.length > 0) {
    const child = existingChildren[0];
    const ok = await updateEntry(child.id, { date });
    if (ok) {
      // Update monthly parent date to match
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

  // Create daily child directly (don't use createEntry to avoid double D23 parent creation)
  const { data: dailyEntry, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: monthly.type,
      content: monthly.content,
      log_type: 'daily',
      date,
      position: existing.length,
      parent_id: monthlyEntryId,
    })
    .select()
    .single();

  if (error) return null;

  // Update monthly parent date to match the planned day
  await updateEntry(monthlyEntryId, { date });

  return dailyEntry as Entry;
}

// ── Migration helpers ──

/**
 * Migrate a daily task to a different day in the SAME month.
 * 
 * Logic:
 * 1. If a peer with same parent_id exists at target date → reactivate to 'open', else create new
 * 2. Delete all peers with same parent_id with dates AFTER target date  
 * 3. If source entry still exists (wasn't deleted in step 2) → set to 'migrated'
 * 4. Update monthly parent date to target date
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

  // Cross-month migration → use migrateToMonth
  if (origMonth !== newMonth) {
    const targetMonthDate = newDate.slice(0, 7) + '-01';
    return migrateToMonth(id, targetMonthDate);
  }

  // Same-month migration — daily tasks always have a parent_id (D23 invariant)
  const parentId = original.parent_id;
  if (!parentId) {
    console.warn('migrateEntry: daily task without parent_id — this should not happen', id);
    return null;
  }

  // Step 1: Check if a peer exists at target date
  const { data: peerAtTarget } = await supabase()
    .from('entries')
    .select('*')
    .eq('parent_id', parentId)
    .eq('log_type', 'daily')
    .eq('date', newDate)
    .single();

  let result: Entry;

  if (peerAtTarget) {
    // Reactivate existing peer
    await updateEntry(peerAtTarget.id, { status: 'open' });
    result = { ...peerAtTarget, status: 'open' } as Entry;
  } else {
    // Create new daily entry at target date
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
        parent_id: parentId,
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
    .eq('parent_id', parentId)
    .eq('log_type', 'daily')
    .gt('date', newDate)
    .neq('id', result.id);

  // Step 3: If source entry still exists and is not the result, mark as migrated
  if (original.id !== result.id && original.date < newDate) {
    // Check if source still exists (might have been deleted in step 2 if it was after target)
    const { data: sourceStillExists } = await supabase()
      .from('entries')
      .select('id')
      .eq('id', original.id)
      .single();
    if (sourceStillExists) {
      await updateEntry(original.id, { status: 'migrated' });
    }
  } else if (original.id !== result.id && original.date >= newDate) {
    // Source is at or after target — it was already deleted or is the same; 
    // if somehow still exists, delete it
    const { data: sourceStillExists } = await supabase()
      .from('entries')
      .select('id')
      .eq('id', original.id)
      .single();
    if (sourceStillExists) {
      await supabase().from('entries').delete().eq('id', original.id);
    }
  }

  // Step 4: Update monthly parent date to target date
  await updateEntry(parentId, { date: newDate });

  return result;
}

/**
 * Migrate an entry to a different month.
 * - All daily entries with same parent_id → 'migrated'
 * - Monthly parent → 'migrated'  
 * - New monthly entry in target month (open, YYYY-MM-01, unlinked)
 */
export async function migrateToMonth(entryId: string, targetMonthDate: string): Promise<Entry | null> {
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (!original) return null;

  const parentId = original.parent_id;

  if (parentId) {
    // This is a daily entry — mark all peers + self as migrated
    await supabase()
      .from('entries')
      .update({ status: 'migrated' })
      .eq('parent_id', parentId)
      .eq('log_type', 'daily');
    // Mark monthly parent as migrated
    await updateEntry(parentId, { status: 'migrated' });
  } else if (original.log_type === 'monthly' || original.log_type === 'future') {
    // This IS the monthly/future entry — mark children as migrated
    await supabase()
      .from('entries')
      .update({ status: 'migrated' })
      .eq('parent_id', original.id)
      .eq('log_type', 'daily');
    // Mark self as migrated
    await updateEntry(entryId, { status: 'migrated' });
  } else {
    // Daily with no parent — just mark as migrated
    await updateEntry(entryId, { status: 'migrated' });
  }

  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  // Get position in target month
  const targetYear = parseInt(targetMonthDate.slice(0, 4));
  const targetMonth = parseInt(targetMonthDate.slice(5, 7));
  const existingInTarget = await fetchMonthlyEntries(targetYear, targetMonth);

  // Create new monthly entry in target month (unlinked, YYYY-MM-01, open)
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

  // Also sync to all peer daily entries with same parent
  const { data: peers } = await supabase()
    .from('entries')
    .select('id, status')
    .eq('parent_id', daily.parent_id)
    .eq('log_type', 'daily')
    .neq('id', dailyEntryId);

  if (peers) {
    for (const peer of peers) {
      if (peer.status !== 'migrated') {
        await updateEntry(peer.id, { status: newStatus });
      }
    }
  }

  return updateEntry(daily.parent_id, { status: newStatus });
}

export async function syncStatusToChild(monthlyEntryId: string, newStatus: EntryStatus): Promise<boolean> {
  const { data: children } = await supabase()
    .from('entries')
    .select('id, status')
    .eq('parent_id', monthlyEntryId)
    .eq('log_type', 'daily');

  if (!children || children.length === 0) return false;

  let ok = true;
  for (const child of children) {
    // Don't update migrated children
    if (child.status !== 'migrated') {
      const result = await updateEntry(child.id, { status: newStatus });
      if (!result) ok = false;
    }
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
