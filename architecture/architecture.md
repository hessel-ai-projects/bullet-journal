# Bullet Journal — System Architecture

## Overview

This document describes the architecture for migrating the Bullet Journal app from Supabase to the Standard Stack (Neon + Drizzle + Auth.js).

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14+ (App Router) | React framework with SSR/SSG |
| Styling | Tailwind CSS + shadcn/ui | UI components and styling |
| Auth | Auth.js (NextAuth) | Google OAuth + session management |
| Database | Neon (serverless Postgres) | Managed PostgreSQL |
| ORM | Drizzle ORM | Type-safe database queries |
| Realtime | SWR + Polling | Live data updates (3s interval) |
| Deployment | Vercel | Hosting and edge functions |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Vercel Edge                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  / (Daily)  │  │  /monthly   │  │   /future   │  │ /collections/*  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                │                   │         │
│  ┌──────┴────────────────┴────────────────┴───────────────────┴────────┐│
│  │                        Server Actions                                ││
│  │  (entries.ts) — All data mutations use Drizzle transactions          ││
│  └──────┬──────────────────────────────────────────────────────────────┘│
└─────────┼────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Drizzle ORM Layer                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  src/lib/db/schema.ts                                           │    │
│  │  • Type-safe table definitions                                  │    │
│  │  • Relations (users → entries, collections → entries)           │    │
│  │  • Indexes for query performance                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  src/lib/db/index.ts                                            │    │
│  │  • Neon serverless connection                                   │    │
│  │  • Connection pooling                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Neon (PostgreSQL)                                │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐  │
│  │ allowed_users │ │   profiles    │ │  collections  │ │   entries   │  │
│  └───────────────┘ └───────────────┘ └───────────────┘ └─────────────┘  │
│  ┌───────────────┐                                                      │
│  │ meeting_notes │                                                      │
│  └───────────────┘                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Auth Flow (Auth.js + Whitelist)

```
┌──────────┐     ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   User   │────▶│  /login     │────▶│ Google OAuth    │────▶│  Google      │
└──────────┘     └─────────────┘     └─────────────────┘     └──────────────┘
                                              │
                                              ▼
┌──────────┐     ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  App     │◀────│  Callback   │◀────│  Auth.js        │◀────│  Whitelist   │
│  (Home)  │     │  /api/auth/ │     │  signIn callback│     │  Check       │
└──────────┘     │  callback   │     └─────────────────┘     └──────────────┘
                 └─────────────┘
```

### Flow Details

1. **Login** (`/login`)
   - User clicks "Sign in with Google"
   - Calls `signIn('google')` from Auth.js
   - Redirects to Google OAuth consent screen

2. **Callback** (`/api/auth/callback/google`)
   - Google redirects back with auth code
   - Auth.js exchanges code for tokens
   - **Whitelist Check**: Query `allowed_users` table for email
   - If NOT whitelisted: redirect to `/not-authorized`
   - If whitelisted: create/update `profiles` record
   - Create session cookie
   - Redirect to `/`

3. **Session** (Middleware)
   - `auth()` validates JWT session cookie
   - Checks `allowed_users` on every request
   - Unauthenticated → `/login`
   - Non-whitelisted → `/not-authorized`

### Auth Configuration (src/auth.ts)

```typescript
// Key callbacks for whitelist
signIn: async ({ user, account, profile }) => {
  // Check allowed_users table
  const allowed = await db.query.allowedUsers.findFirst({
    where: eq(allowedUsers.email, user.email)
  });
  return !!allowed; // true = allow sign in
}

session: async ({ session, token }) => {
  // Add user.id to session
  session.user.id = token.sub;
  return session;
}
```

---

## Data Flow for Entries

### Entry Types and Log Types

```
Entry Type (visual)          Log Type (storage)
┌─────────────┐              ┌──────────────────────────────┐
│ ● Task      │─────────────▶│ daily / monthly / future     │
│ ○ Event     │─────────────▶│ daily only                   │
│ – Note      │─────────────▶│ daily only                   │
└─────────────┘              └──────────────────────────────┘
```

### Daily Log Data Flow

```
User Input ──▶ parseEntryPrefix() ──▶ Entry Type Detection
                                            │
                                            ▼
                    ┌───────────────────────┴───────────────────────┐
                    │                                               │
                    ▼                                               ▼
               Type = Task                                     Type = Event/Note
                    │                                               │
                    ▼                                               │
         ┌──────────────────┐                                       │
         │ D23: Auto-create │                                       │
         │ monthly parent   │                                       │
         └────────┬─────────┘                                       │
                  │                                                 │
                  ▼                                                 │
    ┌─────────────────────────┐                                     │
    │ • Same task_uid         │                                     │
    │ • monthly_id = null     │                                     │
    │ • date = YYYY-MM-01     │                                     │
    │ • log_type = 'monthly'  │                                     │
    └────────┬────────────────┘                                     │
             │                                                      │
             ▼                                                      ▼
    ┌─────────────────────────┐                           ┌───────────────┐
    │ Create daily entry      │                           │ Create entry  │
    │ • monthly_id → parent   │                           │ • no monthly_id│
    │ • same task_uid         │                           │ • no task_uid │
    └─────────────────────────┘                           └───────────────┘
```

### Monthly Log Data Flow

```
Monthly Tasks Panel (log_type IN ['monthly', 'future'])
         │
         ▼
┌─────────────────────────────────────────┐
│ Task Actions:                           │
│ • Complete ──▶ syncStatusToChild()      │
│ • Cancel   ──▶ syncStatusToChild()      │
│ • Plan to day ──▶ planToDay()           │
│ • Migrate to month ──▶ migrateToMonth() │
└─────────────────────────────────────────┘
         │
         ▼
Calendar Panel
┌─────────────────────────────────────────┐
│ Shows:                                  │
│ • Events as text per day                │
│ • Task count per day                    │
│ Click day ──▶ Navigate to daily log     │
└─────────────────────────────────────────┘
```

### Future Log Data Flow

```
6-Month Grid
┌─────────────────────────────────────────┐
│ Month Card → Shows tasks (future+monthly)
│     │                                   │
│     ▼                                   │
│ ┌─────────────────┐                     │
│ │ Add Task        │                     │
│ │ Complete/Cancel │                     │
│ │ Delete          │                     │
│ └─────────────────┘                     │
└─────────────────────────────────────────┘
```

---

## Jarvis API Architecture

```
External Client                    Next.js API Routes
┌─────────────┐                   ┌──────────────────────────────┐
│  Jarvis     │───X-API-Key──────▶│  /api/jarvis/*               │
│  (Admin)    │   Bearer Token    │  • jarvis-auth.ts validates  │
└─────────────┘                   │  • Drizzle queries           │
                                  │  • Same response format      │
                                  └──────────────────────────────┘
                                               │
                                               ▼
                                  ┌──────────────────────────────┐
                                  │  Neon Database               │
                                  └──────────────────────────────┘
```

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/jarvis/entries` | GET/POST | List/create entries |
| `/api/jarvis/entries/[id]` | GET/PATCH/DELETE | CRUD single entry |
| `/api/jarvis/collections` | GET/POST | List/create collections |
| `/api/jarvis/collections/[id]` | GET/PATCH/DELETE | CRUD single collection |
| `/api/jarvis/collections/[id]/items` | GET/POST | Collection items |
| `/api/jarvis/migrate` | POST | Cross-month migration |

### Authentication

```typescript
// jarvis-auth.ts
export function verifyJarvisAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const apiKey = process.env.JARVIS_API_KEY;
  return authHeader === `Bearer ${apiKey}`;
}
```

---

## Realtime Strategy (SWR Polling)

### Problem
Supabase subscriptions provide live updates. After migration, we need an alternative.

### Solution: SWR with Polling

```typescript
// In DailyLog component
import useSWR from 'swr';

const { data: entries, mutate } = useSWR(
  ['entries', date],
  () => fetchEntriesForDate(date),
  {
    refreshInterval: 3000, // Poll every 3 seconds
    revalidateOnFocus: true,
    dedupingInterval: 1000,
  }
);
```

### Polling Strategy by View

| View | Polling Interval | Reason |
|------|------------------|--------|
| Daily Log | 3 seconds | Active editing, needs near-realtime |
| Monthly Log | 5 seconds | Less frequent updates |
| Future Log | 10 seconds | Rarely changes |
| Collections | 5 seconds | Moderate activity |

### Optimistic Updates

```typescript
// When user creates entry
const newEntry = { /* ... */ };

// Optimistically update UI
mutate([...entries, newEntry], false);

// Then actually create
createEntry(newEntry).then(() => mutate());
```

### Alternative: Server-Sent Events (Optional)

If polling causes performance issues, implement SSE:

```typescript
// Route Handler: /api/realtime
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to database changes
      // Push updates to client
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  });
}
```

---

## Key Data Relationships

### Chain Identity (task_uid)

```
task_uid = "550e8400-e29b-41d4-a716-446655440000"
    │
    ├──▶ Monthly Entry (Month A) ──migrated──▶ Monthly Entry (Month B)
    │      │                                         │
    │      ├── daily child (Day 1)                   ├── daily child (Day 5)
    │      └── daily child (Day 3)
    │
    └──▶ Future Entry (Month C)

Nuclear Delete: DELETE WHERE task_uid = '550e...'
```

### Monthly Parent Link (monthly_id)

```
Daily Entry                    Monthly Entry
┌─────────────────┐            ┌─────────────────┐
│ id: daily-1     │            │ id: monthly-1   │
│ monthly_id ─────┼────────────▶│ id: monthly-1   │
│ task_uid: abc   │            │ task_uid: abc   │
│ log_type: daily │            │ log_type:monthly│
└─────────────────┘            └─────────────────┘

Bidirectional Sync via monthly_id:
• Content edit on daily → update monthly
• Status change on monthly → update all daily children
```

---

## Migration Considerations

### Database Migration

1. **Schema Changes**: Use `drizzle-kit generate` and `drizzle-kit migrate`
2. **Data Migration**: Export Supabase → Transform → Import Neon
3. **Index Preservation**: Maintain all indexes for query performance

### Code Migration

1. **Auth**: Replace `createClient()` with Auth.js session
2. **Queries**: Replace `supabase.from()` with Drizzle queries
3. **Realtime**: Replace subscriptions with SWR polling
4. **Types**: Keep `src/lib/types.ts`, update imports

---

## Performance Considerations

### Indexes (from schema)

- `idx_entries_user_date` — Daily log queries
- `idx_entries_user_log_type` — Monthly/future log queries
- `idx_entries_task_uid` — Nuclear delete, chain resolution
- `idx_entries_collection` — Collection entries
- `idx_collections_user` — User collections
- `idx_meeting_notes_collection` — Meeting notes

### Query Patterns

```typescript
// Daily entries (most frequent)
.select()
.where(and(eq(entries.user_id, userId), eq(entries.date, date)))
.orderBy(entries.position)

// Monthly entries
.select()
.where(and(
  eq(entries.user_id, userId),
  inArray(entries.log_type, ['monthly', 'future']),
  gte(entries.date, startOfMonth),
  lte(entries.date, endOfMonth)
))

// Nuclear delete (transaction)
.delete(entries)
.where(eq(entries.task_uid, taskUid))
```

---

## Security Model

### Database-Level (No RLS needed with Drizzle)

- All queries server-side via Server Actions
- User scoping enforced in query layer
- No direct client database access

### Application-Level

```typescript
// All server actions validate user
export async function fetchEntriesForDate(date: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  
  return db.query.entries.findMany({
    where: and(
      eq(entries.user_id, session.user.id),
      eq(entries.date, date)
    )
  });
}
```

### API-Level (Jarvis)

```typescript
// Bearer token validation
if (!verifyJarvisAuth(request)) {
  return new Response('Unauthorized', { status: 401 });
}
```
