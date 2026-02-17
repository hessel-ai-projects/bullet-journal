'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { MeetingNote, Entry, Collection } from '@/lib/types';
import {
  fetchMeetingNotes,
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
} from '@/lib/meetings';
import {
  fetchCollectionByType,
  fetchActionItems,
  createActionItem,
} from '@/lib/collections';
import { updateEntry, deleteEntry, createEntry } from '@/lib/entries';
import { bulletSymbol, nextStatus } from '@/lib/entries';

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

interface MeetingFormData {
  title: string;
  date: string;
  attendees: string;
  agenda: string;
  notes: string;
}

const emptyForm: MeetingFormData = {
  title: '',
  date: new Date().toISOString().split('T')[0],
  attendees: '',
  agenda: '',
  notes: '',
};

function MeetingForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: MeetingFormData;
  onSubmit: (data: MeetingFormData) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Meeting title"
          className="text-foreground"
        />
      </div>
      <div>
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="text-foreground"
        />
      </div>
      <div>
        <Label htmlFor="attendees">Attendees (comma-separated)</Label>
        <Input
          id="attendees"
          value={form.attendees}
          onChange={(e) => setForm({ ...form, attendees: e.target.value })}
          placeholder="Alice, Bob, Charlie"
          className="text-foreground"
        />
      </div>
      <div>
        <Label htmlFor="agenda">Agenda</Label>
        <Textarea
          id="agenda"
          value={form.agenda}
          onChange={(e) => setForm({ ...form, agenda: e.target.value })}
          placeholder="Discussion topics..."
          rows={3}
          className="text-foreground"
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Meeting notes..."
          rows={6}
          className="text-foreground"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(form)} disabled={!form.title.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function ActionItemsSection({
  meetingNoteId,
  collectionId,
}: {
  meetingNoteId: string;
  collectionId: string;
}) {
  const [items, setItems] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchActionItems(meetingNoteId, collectionId);
    setItems(data);
    setLoading(false);
  }, [meetingNoteId, collectionId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!input.trim()) return;
    const item = await createActionItem({
      collection_id: collectionId,
      parent_id: meetingNoteId,
      content: input.trim(),
      position: items.length,
    });
    if (item) {
      setItems((prev) => [...prev, item]);
      setInput('');
      toast('Action item added');
    }
  };

  const handleStatusCycle = async (entry: Entry) => {
    const newStatus = nextStatus(entry.status);
    const ok = await updateEntry(entry.id, { status: newStatus });
    if (ok) {
      setItems((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: newStatus } : e)));
    }
  };

  const handleMigrateToDaily = async (entry: Entry) => {
    const today = new Date().toISOString().split('T')[0];
    await updateEntry(entry.id, { status: 'migrated' });
    const newEntry = await createEntry({
      type: 'task',
      content: entry.content,
      log_type: 'daily',
      date: today,
      position: 9999,
    });
    if (newEntry) {
      setItems((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'migrated' } : e)));
      toast('Migrated to daily log');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntry(id);
    if (ok) {
      setItems((prev) => prev.filter((e) => e.id !== id));
    }
  };

  if (loading) return <Skeleton className="h-8 w-full" />;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">Action Items</h4>
      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add action item..."
          className="text-sm text-foreground"
        />
        <Button size="sm" onClick={handleAdd}>Add</Button>
      </div>
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2 py-1 px-2 rounded hover:bg-accent/50">
          <button
            onClick={() => handleStatusCycle(item)}
            className={cn(
              'w-5 h-5 flex items-center justify-center text-sm shrink-0 cursor-pointer',
              item.status !== 'open' && 'text-muted-foreground'
            )}
          >
            {item.status === 'done' ? '×' : item.status === 'migrated' ? '>' : bulletSymbol.task}
          </button>
          <span className={cn(
            'flex-1 text-sm',
            item.status === 'done' && 'line-through text-muted-foreground',
            item.status === 'migrated' && 'text-muted-foreground italic',
          )}>
            {item.content}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.status === 'open' && (
              <button
                onClick={() => handleMigrateToDaily(item)}
                className="text-xs text-muted-foreground hover:text-foreground px-1"
                title="Migrate to daily log"
              >→</button>
            )}
            <button
              onClick={() => handleDelete(item.id)}
              className="text-xs text-muted-foreground hover:text-destructive px-1"
            >✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MeetingNotes() {
  const [meetings, setMeetings] = useState<MeetingNote[]>([]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeetingNote | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [notes, col] = await Promise.all([
      fetchMeetingNotes(),
      fetchCollectionByType('meetings'),
    ]);
    setMeetings(notes);
    setCollection(col);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form: MeetingFormData) => {
    if (!collection) {
      toast.error('Meetings collection not found');
      return;
    }
    const meeting = await createMeetingNote({
      title: form.title,
      date: form.date,
      attendees: form.attendees.split(',').map((s) => s.trim()).filter(Boolean),
      agenda: form.agenda || null,
      notes: form.notes || null,
      collection_id: collection.id,
    });
    if (meeting) {
      setMeetings((prev) => [meeting, ...prev]);
      setDialogOpen(false);
      toast('Meeting note created');
    }
  };

  const handleUpdate = async (form: MeetingFormData) => {
    if (!editingMeeting) return;
    const ok = await updateMeetingNote(editingMeeting.id, {
      title: form.title,
      date: form.date,
      attendees: form.attendees.split(',').map((s) => s.trim()).filter(Boolean),
      agenda: form.agenda || null,
      notes: form.notes || null,
    });
    if (ok) {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === editingMeeting.id
            ? {
                ...m,
                title: form.title,
                date: form.date,
                attendees: form.attendees.split(',').map((s) => s.trim()).filter(Boolean),
                agenda: form.agenda || null,
                notes: form.notes || null,
              }
            : m
        )
      );
      setEditingMeeting(null);
      toast('Meeting note updated');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteMeetingNote(deleteTarget.id);
    if (ok) {
      setMeetings((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setDeleteTarget(null);
      toast('Meeting note deleted');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📋 Meeting Notes</h1>
          <p className="text-muted-foreground text-sm">Track meetings, attendees, and action items</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>+ New Meeting</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Meeting Note</DialogTitle>
            </DialogHeader>
            <MeetingForm
              initial={emptyForm}
              onSubmit={handleCreate}
              onCancel={() => setDialogOpen(false)}
              submitLabel="Create"
            />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : meetings.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No meeting notes yet. Create your first one.
        </p>
      ) : (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="border rounded-lg">
              <button
                onClick={() => setExpandedId(expandedId === meeting.id ? null : meeting.id)}
                className="w-full text-left p-4 flex items-start justify-between hover:bg-accent/30 transition-colors rounded-lg"
              >
                <div className="space-y-1">
                  <h3 className="font-medium text-foreground">{meeting.title}</h3>
                  <p className="text-xs text-muted-foreground">{formatDate(meeting.date)}</p>
                  {meeting.attendees.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {meeting.attendees.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-muted-foreground text-xs shrink-0 ml-2">
                  {expandedId === meeting.id ? '▼' : '▶'}
                </span>
              </button>

              {expandedId === meeting.id && (
                <div className="px-4 pb-4 space-y-4 border-t pt-4">
                  {meeting.agenda && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-1">Agenda</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{meeting.agenda}</p>
                    </div>
                  )}
                  {meeting.notes && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-1">Notes</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{meeting.notes}</p>
                    </div>
                  )}

                  {collection && (
                    <ActionItemsSection
                      meetingNoteId={meeting.id}
                      collectionId={collection.id}
                    />
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditingMeeting(meeting)
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(meeting)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingMeeting} onOpenChange={(open) => !open && setEditingMeeting(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Meeting Note</DialogTitle>
          </DialogHeader>
          {editingMeeting && (
            <MeetingForm
              initial={{
                title: editingMeeting.title,
                date: editingMeeting.date,
                attendees: editingMeeting.attendees.join(', '),
                agenda: editingMeeting.agenda ?? '',
                notes: editingMeeting.notes ?? '',
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditingMeeting(null)}
              submitLabel="Save"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete meeting note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.title}&quot; and its action items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
