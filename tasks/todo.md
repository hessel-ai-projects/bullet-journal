# Migration Todo — Bullet Journal (Supabase → Standard Stack)

## ✅ COMPLETED

### Phase 1: Setup & Dependencies
- [x] Remove Supabase packages from package.json
- [x] Add new dependencies: drizzle-orm, drizzle-kit, @auth/drizzle-adapter, next-auth, @neondatabase/serverless, swr, ws
- [x] Update .env.local.example with new env vars

### Phase 2: Database Layer
- [x] Create src/lib/db/schema.ts
- [x] Create src/lib/db/index.ts with Neon connection
- [x] Create drizzle.config.ts

### Phase 3: Auth Layer
- [x] Create src/auth.ts with Auth.js config
- [x] Create src/middleware.ts for session handling
- [x] Update src/app/login/page.tsx
- [x] Create src/app/not-authorized/page.tsx
- [x] Create src/app/api/auth/[...nextauth]/route.ts

### Phase 4: Data Layer Migration
- [x] Migrate src/lib/entries.ts to Drizzle
- [x] Migrate src/lib/collections.ts to Drizzle
- [x] Create src/lib/meeting-notes.ts with Drizzle

### Phase 5: API Routes
- [x] Create /api/jarvis/entries/route.ts
- [x] Create /api/jarvis/entries/[id]/route.ts
- [x] Create /api/jarvis/collections/route.ts
- [x] Create /api/jarvis/collections/[id]/route.ts
- [x] Create /api/jarvis/meeting-notes/route.ts
- [x] Create /api/jarvis/migrate/route.ts

### Phase 6: UI Layer (SWR Hooks)
- [x] Create src/hooks/use-entries.ts with polling
- [x] Create src/hooks/use-collections.ts with polling
- [x] Create src/hooks/use-meeting-notes.ts with polling

---

## ⏳ PENDING: Infrastructure Setup & Testing

### Database Setup
- [ ] Set up Neon database
- [ ] Run npm install
- [ ] Run drizzle-kit generate
- [ ] Run drizzle-kit migrate
- [ ] Add first allowed user

### Google OAuth Setup
- [ ] Create OAuth credentials in Google Cloud Console
- [ ] Add redirect URI
- [ ] Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to .env.local
- [ ] Generate AUTH_SECRET

### Testing
- [ ] Test auth flow
- [ ] Test all user stories
- [ ] Test Jarvis API

### Cleanup (Optional)
- [ ] Remove supabase/ directory
- [ ] Delete src/lib/supabase/client.ts
- [ ] Delete src/lib/supabase/server.ts
- [ ] Update README.md
