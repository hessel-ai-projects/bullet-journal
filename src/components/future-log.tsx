'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Entry } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  bulletSymbol,
  fetchFutureEntries,
  createEntry,
  deleteEntryWithSync,
  completeEntry,
  cancelEntry,
} from '@/lib/entries';

function getCurrentAnd6Months() {
  const months: { year: number; month: number; label: string; dateStr: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
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
  return bulletSymbol[entry.type];
}

export function FutureLog() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const months = getCurrentAnd6Months();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchFutureEntries();
    // Future log: tasks only
    setEntries(data.filter(e => e.type === 'task'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const entriesFor = (dateStr: string) => entries.filter(e => e.date === dateStr);

  const addEntry = async (dateStr: string) => {
    const raw = inputs[dateStr]?.trim();
    if (!raw) return;
    // Future log only creates tasks (ignore prefix parsing for type)
    const monthEntries = entriesFor(dateStr);
    const entry = await createEntry({
      type: 'task',
      content: raw,
      log_type: 'future',
      date: dateStr,
      position: monthEntries.length,
    });
    if (entry) {
      setEntries(prev => [...prev, entry]);
      setInputs(prev => ({ ...prev, [dateStr]: '' }));
      toast('Task added');
    }
  };

  const handleComplete = async (entry: Entry) => {
    const ok = await completeEntry(entry.id);
    if (ok) {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      toast('Completed');
    }
  };

  const handleCancel = async (entry: Entry) => {
    const ok = await cancelEntry(entry.id);
    if (ok) {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'cancelled' } : e));
      toast('Cancelled');
    }
  };

  const requestDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const ok = await deleteEntryWithSync(deleteConfirmId);
    if (ok) {
      setEntries(prev => prev.filter(e => e.id !== deleteConfirmId));
      toast('Deleted');
    }
    setDeleteConfirmId(null);
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
                <p className="text-muted-foreground text-xs py-2 text-center">No tasks</p>
              )}
              {monthEntries.map(entry => {
                const isActionable = entry.status === 'open';
                return (
                  <div key={entry.id} className="group flex items-center gap-2 py-1 text-sm">
                    <span className={cn(
                      'shrink-0 w-4 text-center',
                      entry.status !== 'open' && 'text-muted-foreground',
                    )}>
                      {statusIcon(entry)}
                    </span>
                    <span className={cn(
                      'flex-1 truncate text-xs',
                      entry.status === 'done' && 'line-through text-muted-foreground',
                      entry.status === 'cancelled' && 'line-through text-muted-foreground/70',
                      entry.status === 'migrated' && 'text-muted-foreground',
                    )}>
                      {entry.content}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {isActionable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-xs text-muted-foreground hover:text-foreground px-1" title="Actions">
                              ⋯
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => handleComplete(entry)}>
                              <span className="mr-2">✓</span> Complete
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCancel(entry)}>
                              <span className="mr-2">✕</span> Cancel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => requestDelete(entry.id)} className="text-destructive">
                              <span className="mr-2">🗑</span> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <button
                          onClick={() => requestDelete(entry.id)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <input
              value={inputs[m.dateStr] || ''}
              onChange={(e) => setInputs(prev => ({ ...prev, [m.dateStr]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addEntry(m.dateStr)}
              placeholder="Add task..."
              className="w-full bg-transparent text-xs text-foreground border-b border-border/50 outline-none py-1 placeholder:text-muted-foreground"
              aria-label={`Add task to ${m.label}`}
            />
          </div>
        );
      })}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this task and all its copies across all months.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
