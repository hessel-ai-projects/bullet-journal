'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Entry, EntryType } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import {
  bulletSymbol,
  parseEntryPrefix,
  fetchEntriesForMonth,
  fetchMonthlyEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  nextStatus,
  assignMonthlyTaskToDay,
  fetchAssignedDays,
} from '@/lib/entries';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusIcon(entry: Entry) {
  if (entry.status === 'done') return '×';
  if (entry.status === 'migrated') return '>';
  if (entry.status === 'scheduled') return '<';
  return bulletSymbol[entry.type];
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
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month, 0).getDate();

  const load = useCallback(async () => {
    setLoading(true);
    const [daily, monthly] = await Promise.all([
      fetchEntriesForMonth(year, month),
      fetchMonthlyEntries(year, month),
    ]);
    setDailyEntries(daily);
    setMonthlyTasks(monthly);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // Load assigned days for all monthly tasks
  useEffect(() => {
    if (monthlyTasks.length === 0) return;
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

  const handleAssignToDay = async (entry: Entry, day: number) => {
    const result = await assignMonthlyTaskToDay(entry, day, year, month);
    if (result) {
      toast(`Assigned to day ${day}`);
      setAssigningId(null);
      // Update local state
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      setAssignedDaysMap(prev => ({
        ...prev,
        [entry.id]: [...(prev[entry.id] || []), dateStr],
      }));
      setMonthlyTasks(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'scheduled' } : e));
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

  const handleStatusCycle = async (entry: Entry) => {
    const newStatus = nextStatus(entry.status);
    const ok = await updateEntry(entry.id, { status: newStatus });
    if (ok) {
      setMonthlyTasks(prev => prev.map(e => e.id === entry.id ? { ...e, status: newStatus } : e));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntry(id);
    if (ok) {
      setMonthlyTasks(prev => prev.filter(e => e.id !== id));
      toast('Deleted');
    }
  };

  const eventsByDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dailyEntries.filter(e => e.date === dateStr && e.type === 'event');
  };

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
              const dayEntries = eventsByDay(day);
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
                    {dayEntries.slice(0, 3).map(e => e.content).join(' · ')}
                  </span>
                  {dayEntries.length > 0 && (
                    <span className="text-xs text-muted-foreground">{dayEntries.length}</span>
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
              return (
                <div key={entry.id} className="group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-accent/50 transition-colors">
                  <button
                    onClick={() => handleStatusCycle(entry)}
                    className="w-5 h-5 flex items-center justify-center text-sm shrink-0 mt-0.5"
                  >
                    {statusIcon(entry)}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'text-sm',
                      entry.status === 'done' && 'line-through text-muted-foreground',
                      entry.status === 'scheduled' && 'text-muted-foreground italic',
                    )}>
                      {entry.content}
                    </span>
                    {assignedDayNums.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {assignedDayNums.map(d => (
                          <Badge key={d} variant="secondary" className="text-[10px] px-1 py-0 h-4 cursor-pointer" onClick={() => goToDay(d)}>
                            Day {d}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {entry.type === 'task' && entry.status !== 'done' && (
                      <Popover open={assigningId === entry.id} onOpenChange={(open) => setAssigningId(open ? entry.id : null)}>
                        <PopoverTrigger asChild>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground px-1"
                            title="Assign to day"
                          >
                            📅
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="end">
                          <p className="text-xs font-medium mb-2">Assign to day:</p>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                              const isAssigned = assignedDayNums.includes(d);
                              return (
                                <button
                                  key={d}
                                  disabled={isAssigned}
                                  onClick={() => handleAssignToDay(entry, d)}
                                  className={cn(
                                    'w-7 h-7 text-xs rounded hover:bg-accent transition-colors',
                                    isAssigned && 'bg-primary/20 text-muted-foreground cursor-not-allowed',
                                  )}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-muted-foreground hover:text-destructive px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
