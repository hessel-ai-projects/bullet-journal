import type { EntryType, EntryStatus } from '@/lib/types';

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
