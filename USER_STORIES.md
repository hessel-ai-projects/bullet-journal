# Bullet Journal — User Stories & Rules

## Legend
- ✅ Implemented
- ❌ Not implemented / Deferred

---

## 1. Authentication

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| A1 | User can sign in with Google OAuth | ✅ | |
| A2 | Only whitelisted emails (in `allowed_users` table) can access the app | ✅ | Non-whitelisted users are signed out and redirected to `/not-authorized` |
| A3 | User profile is auto-created on first login | ✅ | Created in auth callback route (NOT via DB trigger — triggers on `auth.users` fail due to RLS) |
| A4 | User can sign out | ✅ | Via sidebar button |

---

## 2. Daily Log (`/`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| D1 | User sees entries for the current date on load | ✅ | Default view is today |
| D2 | User can navigate between days (prev/next arrows) | ✅ | |
| D3 | User can jump to any date via calendar picker | ✅ | |
| D4 | User can jump back to "Today" with one click | ✅ | Button shown when not on today |
| D5 | User can rapidly add entries by typing + Enter | ✅ | |
| D6 | Default entry type is **task** (`●`) | ✅ | No prefix needed |
| D7 | Prefix `*` creates an **event** (`○`) | ✅ | `* Meeting at 3pm` → event |
| D8 | Prefix `-` creates a **note** (`–`) | ✅ | `- Remember this` → note |
| D9 | User can complete a task or event | ✅ | Via `⋯` dropdown → Complete. Symbol → `×`, text strikethrough |
| D10 | User can cancel a task or event | ✅ | Via `⋯` dropdown → Cancel. Symbol stays type symbol, text strikethrough + muted |
| D11 | User can migrate a task/event to another day (same month) | ✅ | Via `⋯` → "Migrate to day". Peer-based: reactivates existing peer at target or creates new. Deletes peers after target date. Source marked `>` migrated. Monthly parent date updated |
| D12 | User can migrate a task/event to another month | ✅ | Via `⋯` → "Migrate to month". All daily peers + monthly parent → migrated. New monthly entry in target (same `task_uid`, unlinked) |
| D13 | User can inline-edit entry content by clicking it | ✅ | Migrated entries are read-only (click does nothing) |
| D14 | Content edits sync bidirectionally | ✅ | Via `updateEntryWithSync`. Syncs to monthly parent + daily children. Skips migrated entries |
| D15 | User can delete an entry | ✅ | Hover → 🗑 (desktop), swipe-to-delete (mobile) |
| D16 | Deleting any entry deletes the ENTIRE chain | ✅ | `deleteEntryWithSync`: fetches `task_uid`, then `DELETE WHERE task_uid = X`. Kills all copies across all months |
| D17 | Past incomplete tasks are flagged when viewing today | ✅ | Yellow banner showing open daily tasks from previous days |
| D18 | User can migrate individual past incomplete tasks to today | ✅ | "Migrate" button per task. Uses `migrateEntry` (same or cross-month) |
| D19 | User can bulk-migrate all past incomplete tasks to today | ✅ | "Migrate all to today" button |
| D20 | User can pull unassigned monthly tasks into today | ✅ | "Monthly" button → dialog → checkbox select → "Add to today". Uses `planToDay` |
| D21 | Completing/cancelling a daily task syncs to monthly parent + peers | ✅ | `syncStatusToParent` updates monthly parent + all non-migrated peer dailies |
| D22 | Entries update in realtime via Supabase subscription | ✅ | Listens to `entries` table changes for current date |
| D23 | Tasks created in daily log auto-create a monthly parent | ✅ | Monthly parent: `log_type='monthly'`, `date=actual date`, `status='open'`, same `task_uid`. Daily entry gets `monthly_id` → monthly parent. Only tasks — not events or notes |

### Daily Log Rules
- **Entry types**: task (default), event (`*` prefix), note (`-` prefix)
- **Symbols**: task=`●`, event=`○`, note=`–`
- **Notes**: create and delete only — no status actions (no complete/cancel/migrate)
- **Events**: same actions as tasks (complete, cancel, migrate, delete)
- **Migrated entries are read-only** — no content edits, no status changes
- **Migrated resolved visual**: if the chain's `task_uid` has any entry with status `done` or `cancelled`, the migrated entry shows strikethrough + muted text
- **Status transitions are EXPLICIT** (via `⋯` dropdown), NOT click-to-cycle
- **All deletes are nuclear**: `deleteEntryWithSync` → `DELETE WHERE task_uid = X`
- **D23 invariant**: every daily task MUST have a `monthly_id` (either from D23 auto-creation or from `planToDay`)

---

## 3. Monthly Log (`/monthly`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| M1 | Two-panel layout: calendar (left) + tasks (right) | ✅ | |
| M2 | Calendar shows days 1-31 with day names | ✅ | Click day → navigates to daily log |
| M3 | Calendar shows only **events** as text per day | ✅ | |
| M4 | Calendar shows **task count** per day | ✅ | e.g., `3 ●` |
| M5 | User can navigate between months | ✅ | |
| M6 | Today highlighted | ✅ | |
| M7 | Weekends muted | ✅ | |
| M8 | Tasks panel shows all tasks for the month | ✅ | Queries `log_type IN ['monthly', 'future']`, filtered to `type='task'` |
| M9 | User can add a monthly task via input | ✅ | Creates `log_type='monthly'`, `date=YYYY-MM-01` |
| M10 | User can complete a monthly task | ✅ | Via `⋯` → Complete. Syncs to daily children via `syncStatusToChild` |
| M11 | User can cancel a monthly task | ✅ | Via `⋯` → Cancel. Syncs to daily children |
| M12 | User can plan a monthly task to a day | ✅ | Via `⋯` → Plan to day → day picker. Creates daily child with same `task_uid` + `monthly_id`. Max ONE active daily child. Does NOT change monthly parent status |
| M13 | Assigned tasks show day badges | ✅ | Clickable → jumps to that day. Assignment detected by having daily children (not status-based) |
| M14 | User can migrate a monthly task to another month | ✅ | Via `⋯` → Migrate to month. Old entry → migrated. New monthly in target with same `task_uid` |
| M15 | User can delete a monthly task | ✅ | Nuclear delete via `task_uid` — kills entire chain |
| M16 | Migrated tasks show resolved visual | ✅ | Via `fetchChainResolutions` on `task_uid` |

### Monthly Log Rules
- **Calendar panel**: events as text, task count as number
- **Tasks panel**: `log_type IN ['monthly', 'future']`, tasks only
- **Planning to day**: creates daily child, does NOT change monthly status. Assignment = has children
- **Max one active daily child per monthly task**. Re-planning moves the existing child
- **Bidirectional sync**: monthly ↔ daily via `monthly_id` link + `syncStatusToChild`/`syncStatusToParent`

---

## 4. Future Log (`/future`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| F1 | Shows current month + next 6 months in a grid | ✅ | Responsive: 1/2/3 columns |
| F2 | Each month card shows tasks for that month | ✅ | Queries `log_type IN ['future', 'monthly']`, filtered to `type='task'` |
| F3 | User can add tasks to any month | ✅ | Always creates `type='task'` (future log is tasks only) |
| F4 | User can complete/cancel tasks | ✅ | Via `⋯` dropdown |
| F5 | User can delete tasks | ✅ | Nuclear delete via `task_uid` |
| F6 | Clicking month name → monthly log | ✅ | |
| F7 | Monthly and future entries appear in both views | ✅ | Both query `IN ['monthly', 'future']` |

### Future Log Rules
- **Tasks only** — no events, no notes in the future log
- Future entries use `log_type='future'`, `date=YYYY-MM-01`
- Monthly and future entries are interchangeable between views

---

## 5. Meeting Notes (`/collections/meetings`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| MN1 | List of meeting notes, newest first | ✅ | |
| MN2 | Create meeting note (title, date, attendees, agenda, notes) | ✅ | |
| MN3 | Expandable details | ✅ | |
| MN4 | Edit meeting note | ✅ | |
| MN5 | Delete meeting note (with confirmation) | ✅ | |
| MN6 | Action items section per meeting | ✅ | |
| MN7 | Add action items | ✅ | Creates `log_type='monthly'`, tagged `meeting:<id>` |
| MN8 | Action items appear in monthly tasks panel | ✅ | Because `log_type='monthly'` |
| MN9 | Toggle action item status (open/done) | ✅ | Click-to-toggle (exception to dropdown rule — simple binary toggle) |
| MN10 | Migrate action items to daily log | ✅ | Creates daily entry (D23 auto-creates monthly parent with shared `task_uid`) |
| MN11 | Auto-creates on first visit | ✅ | |

### Meeting Notes Rules
- Meeting data in `meeting_notes` table, action items in `entries` table
- Action items linked via `tags=['meeting:<meeting_note_id>']` (NOT `monthly_id`)
- Action items use `log_type='monthly'` so they appear in the monthly tasks panel

---

## 6. Ideas Collection (`/collections/ideas`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| I1 | List of ideas with tags | ✅ | |
| I2 | Quick-add with comma-separated tags | ✅ | |
| I3 | Tag badges | ✅ | |
| I4 | Filter by tag | ✅ | |
| I5 | Edit idea (content + tags) | ✅ | |
| I6 | Delete idea | ✅ | |
| I7 | Promote idea to task in today's daily log | ✅ | Creates daily entry → D23 auto-creates monthly parent |
| I8 | Auto-creates on first visit | ✅ | |

---

## 7. Custom Collections (`/collections/[id]`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| C1 | Create custom collection (name + emoji) | ✅ | |
| C2 | Appears in sidebar | ✅ | |
| C3 | Shows entries | ✅ | |
| C4 | Rapid logging input | ✅ | |
| C5 | Edit/delete collection | ✅ | |
| C6 | Deleting collection deletes all its entries | ✅ | |

---

## 8. Settings (`/settings`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| S1 | Toggle dark/light mode | ✅ | Persisted in localStorage. Inline script prevents flash |

---

## 9. Sidebar & Navigation

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| N1-N9 | Desktop sidebar, mobile hamburger, nav links, collections, sign out, dark mode toggle, active highlight | ✅ | |

---

## 10. Jarvis Admin API (`/api/jarvis/*`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| J1-J11 | Full CRUD on entries + collections, migrate endpoint, API key auth, user-scoped | ✅ | Migrate endpoint copies `task_uid` to new entry |

---

## 11. Data Model

### Columns on `entries`
| Column | Purpose |
|--------|---------|
| `id` | Primary key (UUID) |
| `task_uid` | **Chain identity** — shared across ALL copies of a task (D23 parent+child, migrations). Delete = `DELETE WHERE task_uid = X` |
| `monthly_id` | **Monthly link** — on daily entries, points to their monthly parent entry. Used for within-month sync (content, status). NULL for monthly/future/collection entries |
| `log_type` | `daily`, `monthly`, `future`, `collection` |
| `type` | `task`, `event`, `note` |
| `status` | `open`, `done`, `migrated`, `cancelled` |
| `date` | Actual date for daily; YYYY-MM-01 for monthly/future (except D23 parents which use actual date) |
| `collection_id` | Links to `collections` table (for collection entries) |
| `tags` | Array (e.g., `['meeting:<id>']` for action items) |

### Key Relationships
```
task_uid (chain identity — never breaks)
├── Monthly entry (log_type='monthly', month A)  ← migrated
│   └── Daily entry (monthly_id → monthly, month A)  ← migrated
├── Monthly entry (log_type='monthly', month B)  ← active
│   └── Daily entry (monthly_id → monthly, month B)  ← active
└── (all share the same task_uid)
```

### Invariants
1. **Every daily task has a `monthly_id`** — either from D23 auto-creation or `planToDay`
2. **Every copy of a task shares the same `task_uid`** — D23, planToDay, all migrations propagate it
3. **Delete is nuclear** — one `task_uid` delete kills ALL entries in the chain
4. **`monthly_id` is within-month only** — cross-month linking is handled by `task_uid`
5. **Monthly and future views overlap** — both query `IN ['monthly', 'future']`

### Entry Type Rules
| Type | D23 auto-parent? | Can migrate? | Actions |
|------|-----------------|-------------|---------|
| Task | ✅ Yes | ✅ Yes | Complete, Cancel, Migrate to day, Migrate to month, Delete |
| Event | ❌ No | ✅ Yes | Complete, Cancel, Migrate to day, Migrate to month, Delete |
| Note | ❌ No | ❌ No | Delete only |

### Status Rules
| Status | Symbol | Visual | Terminal? | Editable? |
|--------|--------|--------|-----------|-----------|
| open | type symbol (`●` `○` `–`) | normal | No | Yes |
| done | `×` | strikethrough | Yes | No (delete only) |
| cancelled | type symbol | strikethrough + muted | Yes | No (delete only) |
| migrated | `>` | muted (+ strikethrough if chain resolved) | Yes | No (read-only) |

---

## Not Yet Implemented
- ❌ Subtask nesting (D16 — deferred to reduce complexity)
- ❌ Google Calendar integration (two-way sync)
- ❌ Apple Calendar (ICS feed)
- ❌ PWA (installable, offline support)
- ❌ Offline queue (IndexedDB → sync on reconnect)
- ❌ Month-end review flow
- ❌ Search across all entries
- ❌ Repeating tasks
