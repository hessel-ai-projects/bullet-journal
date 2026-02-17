import { createClient } from '@/lib/supabase/client';
import type { MeetingNote } from '@/lib/types';

const supabase = () => createClient();

export async function fetchMeetingNotes(): Promise<MeetingNote[]> {
  const { data } = await supabase()
    .from('meeting_notes')
    .select('*')
    .order('date', { ascending: false });
  return (data ?? []) as MeetingNote[];
}

export async function fetchMeetingNote(id: string): Promise<MeetingNote | null> {
  const { data } = await supabase()
    .from('meeting_notes')
    .select('*')
    .eq('id', id)
    .single();
  return data as MeetingNote | null;
}

export async function createMeetingNote(params: {
  title: string;
  date: string;
  attendees: string[];
  agenda: string | null;
  notes: string | null;
  collection_id: string;
}): Promise<MeetingNote | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase()
    .from('meeting_notes')
    .insert({
      user_id: user.id,
      collection_id: params.collection_id,
      title: params.title,
      date: params.date,
      attendees: params.attendees,
      agenda: params.agenda,
      notes: params.notes,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating meeting note:', error);
    return null;
  }
  return data as MeetingNote;
}

export async function updateMeetingNote(
  id: string,
  updates: Partial<Pick<MeetingNote, 'title' | 'date' | 'attendees' | 'agenda' | 'notes'>>
): Promise<boolean> {
  const { error } = await supabase()
    .from('meeting_notes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function deleteMeetingNote(id: string): Promise<boolean> {
  const { error } = await supabase()
    .from('meeting_notes')
    .delete()
    .eq('id', id);
  return !error;
}
