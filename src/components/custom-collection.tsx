'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Entry, Collection } from '@/lib/types';
import {
  fetchCollection,
  fetchCollectionEntries,
  createCollectionEntry,
  updateCollection,
  deleteCollection,
} from '@/lib/collections';
import {
  updateEntry,
  deleteEntry,
  parseEntryPrefix,
  bulletSymbol,
  completeEntry,
  cancelEntry,
} from '@/lib/entries';
import type { EntryStatus } from '@/lib/types';

export function CustomCollection({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [col, items] = await Promise.all([
      fetchCollection(collectionId),
      fetchCollectionEntries(collectionId),
    ]);
    setCollection(col);
    setEntries(items);
    setLoading(false);
  }, [collectionId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!input.trim()) return;
    const { type, content } = parseEntryPrefix(input);
    const entry = await createCollectionEntry({
      collection_id: collectionId,
      type,
      content,
      position: entries.length,
    });
    if (entry) {
      setEntries((prev) => [...prev, entry]);
      setInput('');
    }
  };

  const handleStatusCycle = async (entry: Entry) => {
    const cycle: EntryStatus[] = ['open', 'done'];
    const idx = cycle.indexOf(entry.status);
    const newStatus = cycle[(idx + 1) % cycle.length];
    const ok = await updateEntry(entry.id, { status: newStatus });
    if (ok) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: newStatus } : e)));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntry(id);
    if (ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast('Entry deleted');
    }
  };

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
  };

  const finishEdit = async () => {
    if (!editingId || !editContent.trim()) { setEditingId(null); return; }
    const ok = await updateEntry(editingId, { content: editContent.trim() });
    if (ok) {
      setEntries((prev) => prev.map((e) => (e.id === editingId ? { ...e, content: editContent.trim() } : e)));
    }
    setEditingId(null);
  };

  const handleDeleteCollection = async () => {
    const ok = await deleteCollection(collectionId);
    if (ok) {
      toast('Collection deleted');
      router.push('/');
    }
  };

  const handleEditCollection = async () => {
    if (!editName.trim()) return;
    const ok = await updateCollection(collectionId, { name: editName.trim(), icon: editIcon || '📁' });
    if (ok) {
      setCollection((prev) => prev ? { ...prev, name: editName.trim(), icon: editIcon || '📁' } : prev);
      setShowEditDialog(false);
      toast('Collection updated');
    }
  };

  const statusIcon = (entry: Entry) => {
    if (entry.status === 'done') return '×';
    if (entry.status === 'migrated') return '>';
    if (entry.status === 'scheduled') return '<';
    return bulletSymbol[entry.type];
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Collection not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push('/')}>
          Go home
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {collection.icon} {collection.name}
          </h1>
          <p className="text-muted-foreground text-sm">Custom collection</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditName(collection.name);
              setEditIcon(collection.icon);
              setShowEditDialog(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Quick add */}
      <div className="flex items-center gap-2 border rounded-md p-2 bg-card">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Type and press Enter • prefix: - note, * event"
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No entries yet. Start adding items.
        </p>
      ) : (
        <div className="space-y-0.5">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors"
            >
              <button
                onClick={() => handleStatusCycle(entry)}
                className={cn(
                  'mt-0.5 w-5 h-5 flex items-center justify-center text-sm shrink-0 cursor-pointer',
                  entry.status !== 'open' && 'text-muted-foreground'
                )}
              >
                {statusIcon(entry)}
              </button>
              {editingId === entry.id ? (
                <input
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onBlur={finishEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none border-b border-primary/20"
                  autoFocus
                />
              ) : (
                <span
                  onClick={() => startEdit(entry)}
                  className={cn(
                    'flex-1 text-sm cursor-text',
                    entry.status === 'done' && 'line-through text-muted-foreground',
                    entry.status === 'migrated' && 'text-muted-foreground italic',
                  )}
                >
                  {entry.content}
                </span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-xs text-muted-foreground hover:text-destructive px-1"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit collection dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-foreground" />
            </div>
            <div>
              <Label>Icon (emoji)</Label>
              <Input value={editIcon} onChange={(e) => setEditIcon(e.target.value)} className="text-foreground w-20" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button onClick={handleEditCollection}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{collection.name}&quot; and all its entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCollection}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
