import { createClient } from '@/lib/supabase/client';
import type { Collection, CollectionType, Entry } from '@/lib/types';

const supabase = () => createClient();

export async function fetchCollections(): Promise<Collection[]> {
  const { data } = await supabase()
    .from('collections')
    .select('*')
    .order('created_at', { ascending: true });
  return (data ?? []) as Collection[];
}

export async function fetchCollection(id: string): Promise<Collection | null> {
  const { data } = await supabase()
    .from('collections')
    .select('*')
    .eq('id', id)
    .single();
  return data as Collection | null;
}

const BUILT_IN_COLLECTIONS: Record<string, { name: string; icon: string }> = {
  meetings: { name: 'Meeting Notes', icon: '📋' },
  ideas: { name: 'Ideas', icon: '💡' },
};

export async function fetchCollectionByType(type: CollectionType): Promise<Collection | null> {
  const { data } = await supabase()
    .from('collections')
    .select('*')
    .eq('type', type)
    .single();

  if (data) return data as Collection;

  // Auto-create built-in collections if they don't exist
  const builtin = BUILT_IN_COLLECTIONS[type];
  if (builtin) {
    return createCollection({ name: builtin.name, type, icon: builtin.icon });
  }

  return null;
}

export async function createCollection(params: {
  name: string;
  type: CollectionType;
  icon: string;
}): Promise<Collection | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase()
    .from('collections')
    .insert({
      user_id: user.id,
      name: params.name,
      type: params.type,
      icon: params.icon,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating collection:', error);
    return null;
  }
  return data as Collection;
}

export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'icon'>>
): Promise<boolean> {
  const { error } = await supabase()
    .from('collections')
    .update(updates)
    .eq('id', id);
  return !error;
}

export async function deleteCollection(id: string): Promise<boolean> {
  // Delete all entries in collection first
  await supabase()
    .from('entries')
    .delete()
    .eq('collection_id', id);

  // Delete meeting notes if any
  await supabase()
    .from('meeting_notes')
    .delete()
    .eq('collection_id', id);

  const { error } = await supabase()
    .from('collections')
    .delete()
    .eq('id', id);
  return !error;
}

export async function fetchCollectionEntries(collectionId: string): Promise<Entry[]> {
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('collection_id', collectionId)
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

export async function createCollectionEntry(params: {
  collection_id: string;
  type: 'task' | 'event' | 'note';
  content: string;
  tags?: string[];
  position: number;
}): Promise<Entry | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: params.type,
      content: params.content,
      log_type: 'collection',
      collection_id: params.collection_id,
      date: today,
      position: params.position,
      tags: params.tags ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating collection entry:', error);
    return null;
  }
  return data as Entry;
}

export async function fetchActionItems(meetingNoteId: string, collectionId: string): Promise<Entry[]> {
  const { data } = await supabase()
    .from('entries')
    .select('*')
    .eq('collection_id', collectionId)
    .contains('tags', [`meeting:${meetingNoteId}`])
    .order('position', { ascending: true });
  return (data ?? []) as Entry[];
}

export async function createActionItem(params: {
  collection_id: string;
  meeting_note_id: string; // stored in tags, not FK
  content: string;
  position: number;
}): Promise<Entry | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split('T')[0];
  const monthStr = `${today.slice(0, 7)}-01`;

  // Create as a monthly task (so it shows in monthly log)
  const { data, error } = await supabase()
    .from('entries')
    .insert({
      user_id: user.id,
      type: 'task',
      content: params.content,
      log_type: 'monthly',
      collection_id: params.collection_id,
      date: monthStr,
      position: params.position,
      tags: [`meeting:${params.meeting_note_id}`],
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating action item:', error);
    return null;
  }
  return data as Entry;
}
