'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Entry, EntryType } from '@/lib/types';

const typeIcons: Record<EntryType, string> = {
  task: '•',
  event: '○',
  note: '–',
};

const statusStyles: Record<string, string> = {
  done: 'line-through text-muted-foreground',
  migrated: 'text-muted-foreground italic',
  scheduled: 'text-muted-foreground',
};

export function DailyLog({ initialEntries, date }: { initialEntries: Entry[]; date: string }) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<EntryType>('task');

  const supabase = createClient();

  const addEntry = async () => {
    if (!newContent.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('entries')
      .insert({
        user_id: user.id,
        type: newType,
        content: newContent.trim(),
        log_type: 'daily',
        date,
        position: entries.length,
      })
      .select()
      .single();

    if (data && !error) {
      setEntries([...entries, data as Entry]);
      setNewContent('');
    }
  };

  const toggleStatus = async (entry: Entry) => {
    const newStatus = entry.status === 'done' ? 'open' : 'done';
    const { error } = await supabase
      .from('entries')
      .update({ status: newStatus })
      .eq('id', entry.id);

    if (!error) {
      setEntries(entries.map((e) =>
        e.id === entry.id ? { ...e, status: newStatus } : e
      ));
    }
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from('entries').delete().eq('id', id);
    if (!error) {
      setEntries(entries.filter((e) => e.id !== id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Entry list */}
      <div className="space-y-1">
        {entries.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">
            No entries yet. Start logging your day.
          </p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="group flex items-start gap-3 py-2 px-3 rounded-md hover:bg-accent/50 transition-colors"
          >
            <button
              onClick={() => toggleStatus(entry)}
              className="mt-0.5 text-lg leading-none shrink-0 hover:opacity-70"
              title={entry.type}
            >
              {entry.status === 'done' ? '✕' : typeIcons[entry.type]}
            </button>
            <span className={cn('flex-1 text-sm', statusStyles[entry.status])}>
              {entry.content}
            </span>
            {entry.tags.length > 0 && (
              <div className="flex gap-1">
                {entry.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {entry.source !== 'user' && (
              <Badge variant="outline" className="text-xs opacity-50">
                {entry.source}
              </Badge>
            )}
            <button
              onClick={() => deleteEntry(entry.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs transition-opacity"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* New entry input */}
      <div className="flex items-center gap-2 border rounded-md p-2">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as EntryType)}
          className="bg-transparent text-sm border-none outline-none"
        >
          <option value="task">• Task</option>
          <option value="event">○ Event</option>
          <option value="note">– Note</option>
        </select>
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="Add an entry..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button size="sm" variant="ghost" onClick={addEntry}>
          Add
        </Button>
      </div>
    </div>
  );
}
