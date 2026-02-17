# Bullet Journal

A digital bullet journal web app with an AI-friendly admin API. Built with Next.js 14, Tailwind CSS, shadcn/ui, and Supabase.

## Features

- **Bullet Journal method**: Daily, Monthly, and Future logs
- **Collections**: Meeting notes, ideas, and custom collections
- **Invite-only access**: Email whitelist via `allowed_users` table
- **Google OAuth**: Sign in with Google via Supabase Auth
- **Jarvis Admin API**: Full CRUD API for AI assistants to manage entries
- **Dark mode**: Default dark theme with light mode toggle
- **Responsive**: Desktop sidebar + mobile hamburger menu

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and run the migration file: `supabase/migrations/00001_initial_schema.sql`
3. Note your project URL and keys from **Settings → API**

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web Application)
3. Add redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. In Supabase dashboard: **Authentication → Providers → Google** — enable and paste client ID/secret

### 3. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `JARVIS_API_KEY` | Secret API key for the Jarvis admin API |

### 4. Install & Run

```bash
npm install
npm run dev
```

### 5. Add Users to Whitelist

In the Supabase SQL Editor or via the Jarvis API:

```sql
INSERT INTO allowed_users (email) VALUES ('user@example.com');
```

Only whitelisted users can log in. Others are signed out and redirected.

## Deployment (Vercel)

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings
4. Deploy

## Jarvis Admin API

All endpoints require the `X-API-Key` header and `user_id` query parameter.

```bash
# Base URL
BASE=https://your-app.vercel.app/api/jarvis
API_KEY=your-jarvis-api-key
USER_ID=uuid-of-target-user
```

### Entries

#### List entries
```bash
GET /api/jarvis/entries?user_id=$USER_ID&date=2025-01-15&log_type=daily
```

#### Create entry
```bash
POST /api/jarvis/entries?user_id=$USER_ID
Content-Type: application/json

{
  "type": "task",
  "content": "Review PR #42",
  "log_type": "daily",
  "date": "2025-01-15",
  "tags": ["work"]
}
```
> Automatically sets `source: 'jarvis'`

#### Update entry
```bash
PATCH /api/jarvis/entries/{id}?user_id=$USER_ID
Content-Type: application/json

{
  "status": "done"
}
```

#### Delete entry
```bash
DELETE /api/jarvis/entries/{id}?user_id=$USER_ID
```

### Collections

#### List collections
```bash
GET /api/jarvis/collections?user_id=$USER_ID
```

#### Create collection
```bash
POST /api/jarvis/collections?user_id=$USER_ID
Content-Type: application/json

{
  "name": "Sprint Planning",
  "type": "custom",
  "icon": "🏃"
}
```

#### List collection items
```bash
GET /api/jarvis/collections/{id}/items?user_id=$USER_ID
```

#### Add item to collection
```bash
POST /api/jarvis/collections/{id}/items?user_id=$USER_ID
Content-Type: application/json

{
  "type": "note",
  "content": "Discussed migration timeline",
  "date": "2025-01-15"
}
```

### Migrate Entry

Move an entry to a different date/log type (marks original as `migrated`, creates new copy):

```bash
POST /api/jarvis/migrate?user_id=$USER_ID
Content-Type: application/json

{
  "entry_id": "uuid-of-entry",
  "date": "2025-01-20",
  "log_type": "monthly",
  "status": "scheduled"
}
```

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated layout with sidebar
│   │   ├── page.tsx         # Daily Log (home)
│   │   ├── monthly/
│   │   ├── future/
│   │   ├── collections/[slug]/
│   │   └── settings/
│   ├── api/jarvis/          # Admin API routes
│   ├── auth/callback/       # OAuth callback
│   ├── login/
│   └── not-authorized/
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── sidebar.tsx
│   ├── daily-log.tsx
│   └── theme-provider.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client
│   │   ├── server.ts        # Server client + service client
│   │   └── middleware.ts     # Auth + whitelist middleware
│   ├── jarvis-auth.ts       # API key validation
│   ├── types.ts
│   └── utils.ts
└── middleware.ts             # Next.js middleware entry
```

## License

Private — not for redistribution.
