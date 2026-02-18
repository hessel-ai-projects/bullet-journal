'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Entry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  bulletSymbol,
  parseEntryPrefix,
  fetchEntriesForMonth,
  fetchMonthlyEntries,
  createEntry,
  deleteEntryWithSync,
  completeEntry,
  cancelEntry,
  planToDay,
  migrateToMonth,
  syncStatusToChild,
  fetchAssignedDays,
} from '@/lib/entries';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusIcon(entry: Entry) {
  if (entry.status === 'done') return '×';
  if (entry.status === 'migrated') return '>';
  return bulletSymbol[entry.type];
}

function getNext6Months(currentYear: number, currentMonth: number) {
  const months: { label: string; dateStr: string }[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(currentYear, currentMonth - 1 + i, 1);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    });
  }
  return months;
}

export function MonthlyLog() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dailyEntries, setDailyEntries] = useState<Entry[]>([]);
  const [monthlyTasks, setMonthlyTasks] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [assignedDaysMap, setAssignedDaysMap] = useState<Record<string, string[]>>({});
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month, 0).getDate();

  const load = useCallback(async () => {
    setLoading(true);
    const [daily, monthly] = await Promise.all([
      fetchEntriesForMonth(year, month),
      fetchMonthlyEntries(year, month),
    ]);
    setDailyEntries(daily);
    // Monthly tasks panel: only show log_type='monthly' tasks
    setMonthlyTasks(monthly.filter(e => e.type === 'task'));
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // Load assigned days for each monthly task
  useEffect(() => {
    if (monthlyTasks.length === 0) {
      setAssignedDaysMap({});
      return;
    }
    const loadAssigned = async () => {
      const map: Record<string, string[]> = {};
      await Promise.all(
        monthlyTasks.map(async (t) => {
          const days = await fetchAssignedDays(t.id);
          if (days.length > 0) map[t.id] = days;
        })
      );
      setAssignedDaysMap(map);
    };
    loadAssigned();
  }, [monthlyTasks]);

  const handleComplete = async (entry: Entry) => {
    const ok = await completeEntry(entry.id);
    if (ok) {
      await syncStatusToChild(entry.id, 'done');
      setMonthlyTasks(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      toast('Completed');
    }
  };

  const handleCancel = async (entry: Entry) => {
    const ok = await cancelEntry(entry.id);
    if (ok) {
      await syncStatusToChild(entry.id, 'cancelled');
      setMonthlyTasks(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'cancelled' } : e));
      toast('Cancelled');
    }
  };

  const handlePlanToDay = async (entry: Entry, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const result = await planToDay(entry.id, dateStr);
    if (result) {
      toast(`Planned to day ${day}`);
      setPlanningId(null);
      setAssignedDaysMap(prev => ({
        ...prev,
        [entry.id]: [dateStr],
      }));
      // No status change — assignment is detected by having children
      load(); // Reload to get fresh state
    }
  };

  const handleMigrateToMonth = async (entry: Entry, targetDateStr: string) => {
    const result = await migrateToMonth(entry.id, targetDateStr);
    if (result) {
      setMonthlyTasks(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'migrated' } : e));
      toast('Migrated to ' + new Date(targetDateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      setMovingId(null);
    }
  };

  const navigate = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  const goToDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    router.push(`/?date=${dateStr}`);
  };

  const addMonthlyTask = async () => {
    if (!input.trim()) return;
    const { type, content } = parseEntryPrefix(input);
    // Monthly tasks created here use YYYY-MM-01 (unassigned)
    const monthStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const entry = await createEntry({
      type,
      content,
      log_type: 'monthly',
      date: monthStr,
      position: monthlyTasks.length,
    });
    if (entry) {
      setMonthlyTasks(prev => [...prev, entry]);
      setInput('');
      toast('Task added');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntryWithSync(id);
    if (ok) {
      setMonthlyTasks(prev => prev.filter(e => e.id !== id));
      toast('Deleted');
    }
  };

  const entriesByDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dailyEntries.filter(e => e.date === dateStr);
  };

  const futureMonths = getNext6Months(year, month);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-1">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          <div className="space-y-1">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>←</Button>
        <span className="text-lg font-semibold min-w-[180px] text-center">{monthName}</span>
        <Button variant="ghost" size="sm" onClick={() => navigate(1)}>→</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Calendar list */}
        <div className="space-y-0">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Calendar</h3>
          <div className="space-y-0.5">
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const d = new Date(year, month - 1, day);
              const dayName = DAYS[d.getDay()];
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const dayEntries = entriesByDay(day);
              const dayEvents = dayEntries.filter(e => e.type === 'event');
              const dayTaskCount = dayEntries.filter(e => e.type === 'task').length;
              const todayStr = new Date().toISOString().split('T')[0];
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              
              return (
                <div
                  key={day}
                  onClick={() => goToDay(day)}
                  className={cn(
                    'flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-accent/50 transition-colors text-sm',
                    isWeekend && 'text-muted-foreground',
                    isToday && 'bg-accent/30 font-medium',
                  )}
                >
                  <span className="w-6 text-right tabular-nums">{day}</span>
                  <span className="w-8 text-xs text-muted-foreground">{dayName}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {dayEvents.slice(0, 3).map(e => e.content).join(' · ')}
                  </span>
                  {dayTaskCount > 0 && (
                    <span className="text-xs text-muted-foreground/60">{dayTaskCount} ●</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Monthly tasks */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Monthly Tasks</h3>
          
          <div className="flex items-center gap-2 border rounded-md p-2 bg-card">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMonthlyTask()}
              placeholder="Add a task for this month..."
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-0.5">
            {monthlyTasks.length === 0 && (
              <p className="text-muted-foreground text-xs py-4 text-center">No monthly tasks yet.</p>
            )}
            {monthlyTasks.map(entry => {
              const assigned = assignedDaysMap[entry.id] || [];
              const assignedDayNums = assigned.map(d => parseInt(d.split('-')[2], 10));
              const hasChildren = assigned.length > 0;
              const isOpen = entry.status === 'open';
              const isTerminal = !isOpen;
              const isMigrated = entry.status === 'migrated';
              return (
                <div key={entry.id} className="group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-accent/50 transition-colors">
                  <span className={cn(
                    'w-5 h-5 flex items-center justify-center text-sm shrink-0 mt-0.5',
                    (entry.status === 'done' || entry.status === 'cancelled') && 'text-muted-foreground',
                    isMigrated && 'text-muted-foreground',
                  )}>
                    {statusIcon(entry)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'text-sm',
                      entry.status === 'done' && 'line-through text-muted-foreground',
                      entry.status === 'cancelled' && 'line-through text-muted-foreground/60',
                      isMigrated && 'text-muted-foreground',
                    )}>
                      {entry.content}
                    </span>
                    {/* Show assigned day badges */}
                    {hasChildren && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {assignedDayNums.map(d => (
                          <Badge key={d} variant="secondary" className="text-[10px] px-1 py-0 h-4 cursor-pointer" onClick={() => goToDay(d)}>
                            Day {d}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                    {/* Open tasks: full actions */}
                    {isOpen && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent" title="Actions">
                            ⋯
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleComplete(entry)}>
                            <span className="mr-2">✓</span> Complete
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCancel(entry)}>
                            <span className="mr-2">✕</span> Cancel
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setPlanningId(planningId === entry.id ? null : entry.id)}>
                            <span className="mr-2">📅</span> Plan to day
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setMovingId(movingId === entry.id ? null : entry.id)}>
                            <span className="mr-2">→</span> Migrate to month
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(entry.id)} className="text-destructive">
                            <span className="mr-2">🗑</span> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {/* Terminal: just delete */}
                    {isTerminal && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="text-xs text-muted-foreground hover:text-destructive px-1"
                        title="Delete"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month picker */}
          {(() => {
            if (!movingId) return null;
            const entry = monthlyTasks.find(e => e.id === movingId);
            if (!entry) return null;
            return (
              <div className="border rounded-md p-3 bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Migrate &ldquo;{entry.content}&rdquo; to:</span>
                  <button onClick={() => setMovingId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {futureMonths.map(m => (
                    <button
                      key={m.dateStr}
                      onClick={() => handleMigrateToMonth(entry, m.dateStr)}
                      className="text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors text-center"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Day picker */}
          {planningId && (() => {
            const entry = monthlyTasks.find(e => e.id === planningId);
            if (!entry) return null;
            const assigned = assignedDaysMap[entry.id] || [];
            const assignedDayNums = assigned.map(d => parseInt(d.split('-')[2], 10));
            return (
              <div className="border rounded-md p-3 bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Plan &ldquo;{entry.content}&rdquo; to day:</p>
                  <button onClick={() => setPlanningId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                    const isAssigned = assignedDayNums.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => handlePlanToDay(entry, d)}
                        className={cn(
                          'w-7 h-7 text-xs rounded hover:bg-accent transition-colors',
                          isAssigned && 'bg-primary/20 text-primary font-medium',
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
