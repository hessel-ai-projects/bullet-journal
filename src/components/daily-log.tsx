'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Entry, EntryType, EntryStatus } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  parseEntryPrefix,
  bulletSymbol,
  createEntry,
  updateEntry,
  deleteEntry,
  completeEntry,
  cancelEntry,
  syncStatusToParent,
  fetchEntriesForDate,
  fetchIncompleteFromPast,
  migrateEntry,
  migrateAllIncomplete,
  fetchUnassignedMonthlyTasks,
  assignMonthlyTaskToDay,
} from '@/lib/entries';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function statusIcon(entry: Entry) {
  if (entry.status === 'done') return '×';
  if (entry.status === 'migrated') return '>';
  if (entry.status === 'scheduled') return '<';
  if (entry.status === 'cancelled') return '•';
  return bulletSymbol[entry.type];
}

const statusStyles: Record<EntryStatus, string> = {
  open: '',
  done: 'line-through text-muted-foreground',
  migrated: 'text-muted-foreground italic',
  scheduled: 'text-muted-foreground italic',
  cancelled: 'line-through text-muted-foreground/60',
};

interface DailyLogProps {
  initialEntries: Entry[];
  date: string;
}

export function DailyLog({ initialEntries, date: initialDate }: DailyLogProps) {
  const [date, setDate] = useState(initialDate);
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [pastIncomplete, setPastIncomplete] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [indentLevel, setIndentLevel] = useState(0);
  const [pullOpen, setPullOpen] = useState(false);
  const [monthlyTasks, setMonthlyTasks] = useState<Entry[]>([]);
  const [selectedMonthly, setSelectedMonthly] = useState<Set<string>>(new Set());
  const [pullingMonthly, setPullingMonthly] = useState(false);
  const [migrateCalendarId, setMigrateCalendarId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const loadEntries = useCallback(async (d: string) => {
    setLoading(true);
    const [fetched, incomplete] = await Promise.all([
      fetchEntriesForDate(d),
      d === today ? fetchIncompleteFromPast(d) : Promise.resolve([]),
    ]);
    setEntries(fetched);
    setPastIncomplete(incomplete);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    loadEntries(date);
  }, [date, loadEntries]);

  const loadMonthlyTasks = async () => {
    const d = new Date(date + 'T12:00:00');
    const tasks = await fetchUnassignedMonthlyTasks(d.getFullYear(), d.getMonth() + 1);
    setMonthlyTasks(tasks);
    setSelectedMonthly(new Set());
  };

  const handlePullFromMonthly = async () => {
    if (selectedMonthly.size === 0) return;
    setPullingMonthly(true);
    const d = new Date(date + 'T12:00:00');
    const dayNum = d.getDate();
    let count = 0;
    for (const id of Array.from(selectedMonthly)) {
      const task = monthlyTasks.find(t => t.id === id);
      if (task) {
        const result = await assignMonthlyTaskToDay(task, dayNum, d.getFullYear(), d.getMonth() + 1);
        if (result) count++;
      }
    }
    setPullingMonthly(false);
    setPullOpen(false);
    toast(`Pulled ${count} task${count !== 1 ? 's' : ''} from monthly`);
    loadEntries(date);
  };

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('entries-daily')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'entries',
        filter: `date=eq.${date}`,
      }, () => {
        loadEntries(date);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [date, loadEntries]);

  const handleAdd = async () => {
    if (!input.trim()) return;
    const { type, content } = parseEntryPrefix(input);
    
    let parentId: string | null = null;
    if (indentLevel > 0 && entries.length > 0) {
      const rootEntries = entries.filter(e => !e.parent_id);
      if (rootEntries.length > 0) {
        parentId = rootEntries[rootEntries.length - 1].id;
      }
    }

    const entry = await createEntry({
      type,
      content,
      log_type: 'daily',
      date,
      position: entries.length,
      parent_id: parentId,
    });
    if (entry) {
      setEntries(prev => [...prev, entry]);
      setInput('');
      setIndentLevel(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        setIndentLevel(prev => Math.max(0, prev - 1));
      } else {
        setIndentLevel(prev => Math.min(2, prev + 1));
      }
    }
  };

  const handleComplete = async (entry: Entry) => {
    const ok = await completeEntry(entry.id);
    if (ok) {
      // Bidirectional sync: if this daily entry has a parent, update it
      if (entry.parent_id) {
        await syncStatusToParent(entry.id, 'done');
      }
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      toast('Completed');
    }
  };

  const handleCancel = async (entry: Entry) => {
    const ok = await cancelEntry(entry.id);
    if (ok) {
      if (entry.parent_id) {
        await syncStatusToParent(entry.id, 'cancelled');
      }
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'cancelled' } : e));
      toast('Cancelled');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntry(id);
    if (ok) {
      setEntries(prev => prev.filter(e => e.id !== id));
      toast('Entry deleted');
    }
  };

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const finishEdit = async () => {
    if (!editingId) return;
    if (editContent.trim()) {
      const ok = await updateEntry(editingId, { content: editContent.trim() });
      if (ok) {
        setEntries(prev => prev.map(e => e.id === editingId ? { ...e, content: editContent.trim() } : e));
      }
    }
    setEditingId(null);
  };

  const handleMigrate = async (entry: Entry, targetDate?: string) => {
    const target = targetDate || today;
    const result = await migrateEntry(entry.id, target);
    if (result) {
      toast(`Migrated to ${target === today ? 'today' : target}`);
      setMigrateCalendarId(null);
      loadEntries(date);
    }
  };

  const handleMigrateAll = async () => {
    const count = await migrateAllIncomplete(today, today);
    toast(`Migrated ${count} entries to today`);
    loadEntries(date);
  };

  const navigateDate = (d: string) => {
    setDate(d);
    setEditingId(null);
    setInput('');
    setIndentLevel(0);
  };

  const getDepth = (entry: Entry): number => {
    return entry.parent_id ? 1 : 0;
  };

  const organizedEntries = () => {
    const roots = entries.filter(e => !e.parent_id);
    const result: Entry[] = [];
    for (const root of roots) {
      result.push(root);
      const children = entries.filter(e => e.parent_id === root.id);
      result.push(...children);
    }
    const ids = new Set(result.map(e => e.id));
    for (const e of entries) {
      if (!ids.has(e.id)) result.push(e);
    }
    return result;
  };

  const [touchStart, setTouchStart] = useState<{ id: string; x: number } | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigateDate(addDays(date, -1))}>
          ←
        </Button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[200px]">
              {formatDate(date)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={new Date(date + 'T12:00:00')}
              onSelect={(d) => {
                if (d) {
                  navigateDate(d.toISOString().split('T')[0]);
                  setCalendarOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" onClick={() => navigateDate(addDays(date, 1))}>
          →
        </Button>
        {date !== today && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigateDate(today)}>
            Today
          </Button>
        )}
      </div>

      {/* Rapid logging input */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 border rounded-md p-2 bg-card flex-1">
          {indentLevel > 0 && (
            <span className="text-muted-foreground text-xs">{'→'.repeat(indentLevel)}</span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type and press Enter • prefix: - note, o event"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
        <Dialog open={pullOpen} onOpenChange={(open) => { setPullOpen(open); if (open) loadMonthlyTasks(); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0" title="Pull from monthly">
              <span className="hidden sm:inline text-xs">Monthly</span>
              <span className="sm:hidden">📋</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Pull from Monthly Tasks</DialogTitle>
            </DialogHeader>
            {monthlyTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No unassigned monthly tasks.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {monthlyTasks.map(task => (
                  <label key={task.id} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-accent/50 cursor-pointer">
                    <Checkbox
                      checked={selectedMonthly.has(task.id)}
                      onCheckedChange={(checked) => {
                        setSelectedMonthly(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(task.id);
                          else next.delete(task.id);
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm">{task.content}</span>
                  </label>
                ))}
              </div>
            )}
            {monthlyTasks.length > 0 && (
              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  disabled={selectedMonthly.size === 0 || pullingMonthly}
                  onClick={handlePullFromMonthly}
                >
                  {pullingMonthly ? 'Adding...' : `Add ${selectedMonthly.size || ''} to today`}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Past incomplete tasks */}
      {pastIncomplete.length > 0 && date === today && (
        <div className="border border-yellow-500/20 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-yellow-500">
              {pastIncomplete.length} incomplete from previous days
            </span>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleMigrateAll}>
              Migrate all to today
            </Button>
          </div>
          {pastIncomplete.slice(0, 5).map(entry => (
            <div key={entry.id} className="flex items-center gap-3 py-1 px-2 text-sm text-muted-foreground">
              <span className="text-xs opacity-50">{entry.date}</span>
              <span>{bulletSymbol[entry.type]}</span>
              <span className="flex-1 truncate">{entry.content}</span>
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => handleMigrate(entry)}>
                Migrate
              </Button>
            </div>
          ))}
          {pastIncomplete.length > 5 && (
            <p className="text-xs text-muted-foreground px-2">
              +{pastIncomplete.length - 5} more
            </p>
          )}
        </div>
      )}

      {/* Entry list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          {entries.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No entries yet. Start logging your day.
            </p>
          )}
          {organizedEntries().map((entry) => {
            const depth = getDepth(entry);
            const isSwiped = swipedId === entry.id;
            const isTask = entry.type === 'task';
            const isActionable = entry.status === 'open';
            return (
              <div
                key={entry.id}
                className={cn(
                  'group flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-all relative',
                  isSwiped && 'translate-x-[-60px]'
                )}
                style={{ paddingLeft: `${8 + depth * 24}px` }}
                onTouchStart={(e) => setTouchStart({ id: entry.id, x: e.touches[0].clientX })}
                onTouchMove={(e) => {
                  if (touchStart?.id === entry.id) {
                    const diff = touchStart.x - e.touches[0].clientX;
                    if (diff > 60) setSwipedId(entry.id);
                    else setSwipedId(null);
                  }
                }}
                onTouchEnd={() => setTouchStart(null)}
              >
                <span
                  className={cn(
                    'mt-0.5 w-5 h-5 flex items-center justify-center text-sm shrink-0',
                    entry.status === 'done' && 'text-muted-foreground',
                    entry.status === 'migrated' && 'text-muted-foreground',
                    entry.status === 'scheduled' && 'text-muted-foreground',
                    entry.status === 'cancelled' && 'text-muted-foreground/60',
                  )}
                  title={`${entry.type} — ${entry.status}`}
                >
                  {statusIcon(entry)}
                </span>
                
                {editingId === entry.id ? (
                  <input
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onBlur={finishEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none border-b border-primary/20"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(entry)}
                    className={cn(
                      'flex-1 text-sm cursor-text transition-colors',
                      statusStyles[entry.status]
                    )}
                  >
                    {entry.content}
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                  {isTask && isActionable && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent" title="Actions">
                          ⋯
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleComplete(entry)}>
                          <span className="mr-2">✓</span> Complete
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCancel(entry)}>
                          <span className="mr-2">✕</span> Cancel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMigrateCalendarId(entry.id)}>
                          <span className="mr-2">&gt;</span> Migrate to day
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {!isTask && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-muted-foreground hover:text-destructive px-1"
                      title="Delete"
                    >
                      ✕
                    </button>
                  )}
                  {isTask && !isActionable && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-muted-foreground hover:text-destructive px-1"
                      title="Delete"
                    >
                      🗑
                    </button>
                  )}
                </div>

                {/* Swipe delete button (mobile) */}
                {isSwiped && (
                  <button
                    onClick={() => { handleDelete(entry.id); setSwipedId(null); }}
                    className="absolute right-0 top-0 bottom-0 w-[56px] bg-destructive text-destructive-foreground flex items-center justify-center text-xs rounded-r-md"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Migrate calendar popover */}
      {migrateCalendarId && (
        <div className="border rounded-md p-3 bg-card space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Migrate to which day?</p>
            <button onClick={() => setMigrateCalendarId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <Calendar
            mode="single"
            onSelect={(d) => {
              if (d) {
                const entry = entries.find(e => e.id === migrateCalendarId);
                if (entry) {
                  handleMigrate(entry, d.toISOString().split('T')[0]);
                }
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
