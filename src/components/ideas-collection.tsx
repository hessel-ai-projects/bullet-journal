'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  fetchCollectionByType,
  fetchCollectionEntries,
  createCollectionEntry,
} from '@/lib/collections';
import { updateEntry, deleteEntry, createEntry } from '@/lib/entries';

export function IdeasCollection() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [ideas, setIdeas] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [editingIdea, setEditingIdea] = useState<Entry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const col = await fetchCollectionByType('ideas');
    if (col) {
      setCollection(col);
      const entries = await fetchCollectionEntries(col.id);
      setIdeas(entries);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const allTags = Array.from(new Set(ideas.flatMap((i) => i.tags || [])));

  const filteredIdeas = filterTag
    ? ideas.filter((i) => i.tags?.includes(filterTag))
    : ideas;

  const handleAdd = async () => {
    if (!input.trim() || !collection) return;
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const entry = await createCollectionEntry({
      collection_id: collection.id,
      type: 'note',
      content: input.trim(),
      tags,
      position: ideas.length,
    });
    if (entry) {
      setIdeas((prev) => [...prev, entry]);
      setInput('');
      setTagInput('');
      toast('Idea added');
    }
  };

  const handlePromoteToTask = async (idea: Entry) => {
    const today = new Date().toISOString().split('T')[0];
    const newEntry = await createEntry({
      type: 'task',
      content: idea.content,
      log_type: 'daily',
      date: today,
      position: 9999,
    });
    if (newEntry) {
      toast('Promoted to task in daily log');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteEntry(id);
    if (ok) {
      setIdeas((prev) => prev.filter((e) => e.id !== id));
      toast('Idea deleted');
    }
  };

  const handleEditSave = async () => {
    if (!editingIdea) return;
    const tags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const ok = await updateEntry(editingIdea.id, {
      content: editContent.trim(),
      tags,
    });
    if (ok) {
      setIdeas((prev) =>
        prev.map((e) =>
          e.id === editingIdea.id
            ? { ...e, content: editContent.trim(), tags }
            : e
        )
      );
      setEditingIdea(null);
      toast('Idea updated');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">💡 Ideas</h1>
        <p className="text-muted-foreground text-sm">Capture ideas, tag them, promote to tasks</p>
      </div>

      {/* Quick add */}
      <div className="border rounded-md p-3 space-y-2 bg-card">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAdd()}
          placeholder="Capture an idea..."
          className="text-foreground"
        />
        <div className="flex items-center gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Tags (comma-separated)"
            className="text-sm text-foreground"
          />
          <Button size="sm" onClick={handleAdd}>Add</Button>
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-xs text-muted-foreground mr-1">Filter:</span>
          <Badge
            variant={filterTag === '' ? 'default' : 'secondary'}
            className="cursor-pointer text-xs"
            onClick={() => setFilterTag('')}
          >
            All
          </Badge>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={filterTag === tag ? 'default' : 'secondary'}
              className="cursor-pointer text-xs"
              onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Ideas list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filteredIdeas.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          {ideas.length === 0 ? 'No ideas yet. Start capturing!' : 'No ideas match this filter.'}
        </p>
      ) : (
        <div className="space-y-1">
          {filteredIdeas.map((idea) => (
            <div
              key={idea.id}
              className="group flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 transition-colors border"
            >
              <span className="text-sm mt-0.5 shrink-0">💡</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{idea.content}</p>
                {idea.tags && idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {idea.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => {
                    setEditingIdea(idea);
                    setEditContent(idea.content);
                    setEditTags((idea.tags || []).join(', '));
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                  title="Edit"
                >✏️</button>
                <button
                  onClick={() => handlePromoteToTask(idea)}
                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                  title="Promote to task"
                >📋</button>
                <button
                  onClick={() => handleDelete(idea.id)}
                  className="text-xs text-muted-foreground hover:text-destructive px-1"
                  title="Delete"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingIdea} onOpenChange={(open) => !open && setEditingIdea(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Edit Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Content</Label>
              <Input
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="text-foreground"
              />
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingIdea(null)}>Cancel</Button>
              <Button onClick={handleEditSave}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
