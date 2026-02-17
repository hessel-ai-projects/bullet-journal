'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Entry } from '@/lib/types';
import {
  bulletSymbol,
  parseEntryPrefix,
  fetchFutureEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  nextStatus,
} from '@/lib/entries';

function getNext6Months() {
  const months: { year: number; month: number; label: string; dateStr: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    });
  }
  return months;
}

function statusIcon(entry: Entry) {
  if (entry.status === 'done') return '×';
  if (entry.status === 'migrated') return '>';
  if (entry.status === 'scheduled') return '<';
  return bulletSymbol[entry.type];
}

export function FutureLog() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const months = getNext6Months();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchFutureEntries();
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const entriesFor = (dateStr: string) => entries.filter(e => e.date === dateStr);

  const addEntry = async (dateStr: string) => {
    const raw = inputs[dateStr]?.trim();
    if (!raw) return;
    const { type, content } = parseEntryPrefix(raw);
    const monthEntries = entriesFor(dateStr);
    const entry = await createEntry({
      type,
      content,
      log_type: 'future',
      date: dateStr,
      position: monthEntries.length,
    });
    if (entry) {
      setEntries(prev => [...prev, entry]);
      setInputs(prev => ({ ...prev, [dateStr]: '' }));
      toast('Entry added');
    }
  };

  const handleStatusCycle = async (entry: Entry) => {
    const newStatus = nextStatus(entry.status);
    const ok = await updateEntry(entry.id, { status: newStatus });
    if (ok) {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: newStatus } : e));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntry(id);
    if (ok) {
      setEntries(prev => prev.filter(e => e.id !== id));
      toast('Deleted');
    }
  };

  const goToMonth = (year: number, month: number) => {
    router.push(`/monthly?year=${year}&month=${month}`);
  };

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {months.map(m => {
        const monthEntries = entriesFor(m.dateStr);
        return (
          <div key={m.dateStr} className="border rounded-lg p-4 space-y-3 bg-card">
            <button
              onClick={() => goToMonth(m.year, m.month)}
              className="text-sm font-semibold hover:underline"
            >
              {m.label}
            </button>

            <div className="space-y-0.5 min-h-[40px]">
              {monthEntries.length === 0 && (
                <p className="text-muted-foreground text-xs py-2 text-center">No entries</p>
              )}
              {monthEntries.map(entry => (
                <div key={entry.id} className="group flex items-center gap-2 py-1 text-sm">
                  <button onClick={() => handleStatusCycle(entry)} className="shrink-0 w-4 text-center">
                    {statusIcon(entry)}
                  </button>
                  <span className={cn(
                    'flex-1 truncate text-xs',
                    entry.status === 'done' && 'line-through text-muted-foreground',
                  )}>
                    {entry.content}
                  </span>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <input
              value={inputs[m.dateStr] || ''}
              onChange={(e) => setInputs(prev => ({ ...prev, [m.dateStr]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addEntry(m.dateStr)}
              placeholder="Add entry..."
              className="w-full bg-transparent text-xs border-b border-border/50 outline-none py-1 placeholder:text-muted-foreground"
            />
          </div>
        );
      })}
    </div>
  );
}
