-- Bullet Journal Schema
-- Run this in the Supabase SQL Editor or via supabase db push

-- ============================================================
-- Tables
-- ============================================================

-- Allowed users (invite-only whitelist)
CREATE TABLE allowed_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User profiles (created on first login)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  avatar_url text,
  google_refresh_token text,
  settings jsonb DEFAULT '{"theme": "dark", "defaultView": "daily"}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Collections (meetings, ideas, custom)
CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'custom' CHECK (type IN ('meetings', 'ideas', 'custom')),
  icon text DEFAULT '📋',
  template jsonb,
  created_at timestamptz DEFAULT now()
);

-- Entries (tasks, events, notes)
CREATE TABLE entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('task', 'event', 'note')),
  content text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'migrated', 'scheduled')),
  log_type text NOT NULL CHECK (log_type IN ('daily', 'monthly', 'future', 'collection')),
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  date date NOT NULL,
  parent_id uuid REFERENCES entries(id) ON DELETE CASCADE,
  tags text[] DEFAULT '{}',
  position int DEFAULT 0,
  google_event_id text,
  source text DEFAULT 'user' CHECK (source IN ('user', 'jarvis', 'calendar')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Meeting notes
CREATE TABLE meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  title text NOT NULL,
  attendees text[] DEFAULT '{}',
  agenda text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_entries_user_date ON entries(user_id, date);
CREATE INDEX idx_entries_user_log_type ON entries(user_id, log_type);
CREATE INDEX idx_entries_collection ON entries(collection_id);
CREATE INDEX idx_collections_user ON collections(user_id);
CREATE INDEX idx_meeting_notes_collection ON meeting_notes(collection_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Entries: users can CRUD their own entries
CREATE POLICY "Users can view own entries"
  ON entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries"
  ON entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries"
  ON entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries"
  ON entries FOR DELETE USING (auth.uid() = user_id);

-- Collections: users can CRUD their own collections
CREATE POLICY "Users can view own collections"
  ON collections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own collections"
  ON collections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own collections"
  ON collections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own collections"
  ON collections FOR DELETE USING (auth.uid() = user_id);

-- Meeting notes: users can CRUD their own meeting notes
CREATE POLICY "Users can view own meeting notes"
  ON meeting_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meeting notes"
  ON meeting_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meeting notes"
  ON meeting_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meeting notes"
  ON meeting_notes FOR DELETE USING (auth.uid() = user_id);

-- Allowed users: no direct access (checked via service role in middleware)
-- No policies = no access through client

-- ============================================================
-- Functions
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER meeting_notes_updated_at
  BEFORE UPDATE ON meeting_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup (if whitelisted)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
