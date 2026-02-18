export type EntryType = 'task' | 'event' | 'note';
export type EntryStatus = 'open' | 'done' | 'migrated' | 'cancelled';
export type LogType = 'daily' | 'monthly' | 'future' | 'collection';
export type CollectionType = 'meetings' | 'ideas' | 'custom';
export type EntrySource = 'user' | 'jarvis' | 'calendar';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  settings: {
    theme: 'dark' | 'light';
    defaultView: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  user_id: string;
  type: EntryType;
  content: string;
  status: EntryStatus;
  log_type: LogType;
  collection_id: string | null;
  date: string;
  parent_id: string | null;
  tags: string[];
  position: number;
  google_event_id: string | null;
  source: EntrySource;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  type: CollectionType;
  icon: string;
  template: Record<string, unknown> | null;
  created_at: string;
}

export interface MeetingNote {
  id: string;
  collection_id: string;
  user_id: string;
  date: string;
  title: string;
  attendees: string[];
  agenda: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllowedUser {
  id: string;
  email: string;
  created_at: string;
}
