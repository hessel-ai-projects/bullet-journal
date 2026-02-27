# Bullet Journal Migration Spec (Comprehensive)

## Executive Summary

Migrate from Supabase stack to Standard stack while preserving ALL functionality including complex task chaining, bidirectional sync, and the Jarvis Admin API.

---

## Current Stack Analysis

### Database Schema (Supabase Postgres)

**Tables:**
1. `allowed_users` — Email whitelist for invite-only access
2. `profiles` — User profiles extending auth.users
3. `collections` — Meeting notes, ideas, custom collections
4. `entries` — Core bullet journal entries with complex relationships
5. `meeting_notes` — Meeting details with action items

**Key Schema Details:**

```sql
-- Entries table (core)
entries (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  type text CHECK ('task'|'event'|'note'),
  content text,
  status text CHECK ('open'|'done'|'migrated'|'cancelled'),
  log_type text CHECK ('daily'|'monthly'|'future'|'collection'),
  collection_id uuid REFERENCES collections(id),
  date date NOT NULL,
  monthly_id uuid REFERENCES entries(id),  -- Links daily → monthly
  task_uid uuid NOT NULL,  -- Chain identity for nuclear delete
  tags text[],
  position int,
  google_event_id text,
  source text CHECK ('user'|'jarvis'|'calendar'),
  created_at, updated_at
)
```

**Critical Relationships:**
- `task_uid` = chain identity — ALL copies of a task share this (D23 parent, migrations across months)
- `monthly_id` = within-month sync — daily entries point to their monthly parent
- Nuclear delete: `DELETE WHERE task_uid = X` kills entire chain across all months

### Auth Flow

1. Supabase Auth with Google OAuth
2. Middleware checks session + whitelist (allowed_users table)
3. Auth callback creates profile via upsert
4. Non-whitelisted users signed out and redirected to `/not-authorized`

### Realtime

Supabase subscriptions on `entries` table filtered by date for live updates.

---

## Target Stack (Standard)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS + shadcn/ui (KEEP) |
| Auth | Auth.js (NextAuth) with Google OAuth |
| Database | Neon (serverless Postgres) |
| ORM | Drizzle ORM |
| Realtime | SWR polling (Server-Sent Events optional) |
| Storage | Cloudflare R2 via S3 API (if needed later) |

---

## Migration Requirements

### MUST Preserve (Functional)

1. **Daily Log** (`/`)
   - Rapid logging with prefixes (`- ` note, `* ` event, default task)
   - Date navigation (prev/next, calendar picker, Today button)
   - Entry types: task (●), event (○), note (–)
   - Status actions: Complete (✓→×), Cancel, Migrate to day, Migrate to month
   - Inline editing (migrated entries read-only)
   - Bidirectional content sync via monthly_id
   - Past incomplete tasks banner with migrate all
   - Pull from monthly tasks dialog
   - Swipe-to-delete on mobile
   - Realtime updates

2. **Monthly Log** (`/monthly`)
   - Two-panel: calendar + tasks
   - Calendar shows events as text, task count per day
   - Tasks panel shows monthly/future entries
   - Plan to day (creates daily child with monthly_id)
   - Day badges on assigned tasks (clickable)
   - Migrate to another month

3. **Future Log** (`/future`)
   - 6-month grid view
   - Tasks only (no events/notes)
   - Add/complete/cancel/delete tasks
   - Month click → monthly log

4. **Meeting Notes** (`/collections/meetings`)
   - List meeting notes
   - Create/edit/delete with attendees, agenda, notes
   - Action items (create entries tagged `meeting:<id>`)
   - Action items appear in monthly tasks
   - Toggle status, migrate to daily

5. **Ideas** (`/collections/ideas`)
   - Quick-add with comma-separated tags
   - Tag badges and filtering
   - Promote to task (creates daily entry)

6. **Custom Collections** (`/collections/[id]`)
   - Create custom collections with emoji
   - Rapid logging within collection
   - Edit/delete collection

7. **Jarvis Admin API** (`/api/jarvis/*`)
   - Entries CRUD with user_id query param
   - Collections CRUD
   - Migrate endpoint (copies task_uid)
   - X-API-Key header authentication
   - All existing endpoints must work identically

8. **Auth & Whitelist**
   - Google OAuth only
   - allowed_users table whitelist
   - Auto-profile creation
   - Sign out

### MUST Preserve (Data Model)

- `task_uid` chain identity
- `monthly_id` parent-child linking
- D23 auto-creation (daily task → monthly parent)
- Nuclear delete pattern
- Bidirectional sync (content, status)
- Migrated entry read-only semantics
- Position ordering

---

## Files to Migrate

### Core Data Layer
```
src/lib/supabase/client.ts      → DELETE (replace with nothing)
src/lib/supabase/server.ts      → DELETE (replace with Drizzle)
src/lib/supabase/middleware.ts  → DELETE (replace with Auth.js)
src/lib/db/schema.ts            → CREATE (Drizzle schema)
src/lib/db/index.ts             → CREATE (Drizzle client)
src/lib/db/migrate.ts           → CREATE (Migration runner)
src/lib/types.ts                → KEEP (update imports)
src/lib/entries.ts              → MIGRATE (replace supabase calls)
src/lib/jarvis-auth.ts          → KEEP (no changes)
```

### Auth Layer
```
src/app/login/page.tsx          → MIGRATE (Auth.js signIn)
src/app/auth/callback/route.ts  → MIGRATE (Auth.js callback)
src/app/not-authorized/page.tsx → KEEP (no changes)
src/middleware.ts               → MIGRATE (Auth.js session + whitelist)
```

### API Routes (Jarvis)
```
src/app/api/jarvis/entries/route.ts
src/app/api/jarvis/entries/[id]/route.ts
src/app/api/jarvis/collections/route.ts
src/app/api/jarvis/collections/[id]/route.ts
src/app/api/jarvis/collections/[id]/items/route.ts
src/app/api/jarvis/migrate/route.ts
```
→ ALL MIGRATE to Drizzle queries, keep same request/response format

### UI Components (KEEP but update data fetching)
```
src/components/daily-log.tsx
src/components/monthly-log.tsx
src/components/future-log.tsx
src/components/meeting-notes.tsx
src/components/ideas-collection.tsx
src/components/custom-collection.tsx
src/components/sidebar.tsx
src/components/theme-provider.tsx
src/components/ui/*
```

### Pages (KEEP but update data fetching)
```
src/app/(app)/layout.tsx
src/app/(app)/page.tsx
src/app/(app)/monthly/page.tsx
src/app/(app)/future/page.tsx
src/app/(app)/settings/page.tsx
src/app/(app)/collections/[slug]/page.tsx
src/app/(app)/collections/new/page.tsx
```

---

## Detailed Migration Plan

### Phase 1: Dependencies & Config

**Remove:**
- @supabase/ssr
- @supabase/supabase-js

**Add:**
- drizzle-orm
- drizzle-kit
- @auth/drizzle-adapter
- next-auth
- @neondatabase/serverless
- swr (for polling)
- dotenv

**Environment Variables:**
```
# Remove
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Add
DATABASE_URL="postgresql://user:pass@neon-host/db?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="random-secret"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
JARVIS_API_KEY="..."  # Keep existing
```

### Phase 2: Drizzle Schema

Create `src/lib/db/schema.ts`:

```typescript
// Tables matching current schema exactly
// - allowed_users
// - profiles (for Auth.js user linking)
// - collections
// - entries (with monthly_id, task_uid)
// - meeting_notes

// Indexes matching current
// - idx_entries_user_date
// - idx_entries_user_log_type
// - idx_entries_collection
// - idx_entries_task_uid
// - idx_collections_user
// - idx_meeting_notes_collection
```

Create `drizzle.config.ts` for migrations.

### Phase 3: Auth Migration

Create `src/auth.ts` (Auth.js config):
- Google provider
- Drizzle adapter
- Callbacks for whitelist check
- Session strategy

Update `src/middleware.ts`:
- Use Auth.js `auth()` function
- Check allowed_users table
- Redirect to /login or /not-authorized

Update `src/app/login/page.tsx`:
- Replace `supabase.auth.signInWithOAuth` with `signIn('google')`

Update `src/app/auth/callback/route.ts`:
- Simplify or remove (Auth.js handles callback)

### Phase 4: Data Layer Migration

Update `src/lib/entries.ts`:
- Replace `createClient()` with Drizzle queries
- All functions keep same signatures
- Nuclear delete: `db.delete(entries).where(eq(entries.task_uid, uid))`
- Bidirectional sync: Drizzle transactions

Create `src/lib/db/queries.ts`:
- Server-side query helpers
- User-scoped queries

### Phase 5: API Routes

Update all `/api/jarvis/*` routes:
- Replace `createServiceClient()` with Drizzle
- Keep exact same request/response JSON structure
- Jarvis auth stays the same

### Phase 6: Realtime Replacement

Replace Supabase subscriptions with SWR polling in `daily-log.tsx`:

```typescript
import useSWR from 'swr';

// Replace realtime subscription
const { data: entries } = useSWR(
  ['entries', date],
  () => fetchEntriesForDate(date),
  { refreshInterval: 3000 } // Poll every 3s
);
```

### Phase 7: Testing

**User Story Verification:**
- [ ] A1-A4: Auth works, whitelist blocks
- [ ] D1-D23: All daily log features
- [ ] M1-M16: All monthly log features
- [ ] F1-F7: All future log features
- [ ] MN1-MN11: Meeting notes
- [ ] I1-I8: Ideas collection
- [ ] C1-C6: Custom collections
- [ ] J1-J11: Jarvis API

---

## Data Migration Strategy

### Option A: Fresh Start (Recommended if no critical data)
1. Create new Neon database
2. Run `drizzle-kit migrate`
3. Manually add allowed_users
4. Start using

### Option B: Data Migration (if preserving data)
1. Export from Supabase to SQL
2. Transform schema differences
3. Import to Neon
4. Verify data integrity

---

## Critical Implementation Notes

1. **task_uid is sacred** — Never regenerate, always copy on migration/creation
2. **monthly_id scope** — Only within same month, never cross-month
3. **Nuclear delete** — Must use `task_uid` not `id`
4. **D23 invariant** — Daily tasks MUST have monthly_id
5. **Migrated read-only** — Check status before allowing edits
6. **Bidirectional sync** — Use Drizzle transactions for consistency
7. **Jarvis API compatibility** — External clients depend on current format

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Test migration script thoroughly |
| Auth.js whitelist complexity | Medium | Test all auth flows |
| Realtime UX degradation | Low | 3s polling is acceptable |
| Jarvis API breakage | High | Maintain exact request/response format |
| Bidirectional sync bugs | Medium | Extensive testing of edit flows |

---

## Success Criteria

1. All 50+ user stories pass
2. Jarvis API responds identically
3. No Supabase dependencies remain
4. Deploys successfully to Vercel
5. Performance equal or better
