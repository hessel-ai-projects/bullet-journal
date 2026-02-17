import { createClient } from '@/lib/supabase/client';
import type { Entry, EntryType, EntryStatus } from '@/lib/types';

const supabase = () => createClient();

export function parseEntryPrefix(raw: string): { type: EntryType; content: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('- ')) return { type: 'note', content: trimmed.slice(2) };
  if (trimmed.startsWith('o ') || trimmed.startsWith('* ')) return { type: 'event', content: trimmed.slice(2) };
  return { type: 'task', content: trimmed };
}

export const bulletSymbol: Record<EntryType, string> = {
  task: '•',
  event: '◦',
  note: '–',
};

export const statusSymbol: Record<EntryStatus, string> = {
  open: '',
  done: '×',
  migrated: '>',
  scheduled: '<',
};

export function nextStatus(current: EntryStatus): EntryStatus {
  const cycle: EntryStatus[] = ['open', 'done', 'migrated', 'scheduled'];
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

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

export async function migrateEntry(id: string, newDate: string): Promise<Entry | null> {
  // Mark original as migrated
  await updateEntry(id, { status: 'migrated' });
  
  // Get original entry
  const { data: original } = await supabase()
    .from('entries')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!original) return null;
  
  // Create new entry at target date
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
