# Bullet Journal — User Stories & Rules

## Legend
- ✅ Implemented
- ⚠️ Implemented but buggy / incomplete
- ❌ Not implemented

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
| D2 | User can navigate between days (prev/next arrows) | ✅ | Entries reload on every navigation (including back to same date) |
| D3 | User can jump to any date via calendar picker | ✅ | |
| D4 | User can jump back to "Today" with one click | ✅ | Button shown when not on today |
| D5 | User can rapidly add entries by typing + Enter | ✅ | |
| D6 | Default entry type is **task** (`•`) | ✅ | No prefix needed |
| D7 | Prefix `*` creates an **event** (`⚬`) | ✅ | `* Meeting at 3pm` → event |
| D8 | Prefix `-` creates a **note** (`–`) | ✅ | `- Remember this` → note |
| D9 | User can complete a task | ✅ | Via `⋯` dropdown → Complete. Symbol changes to `×`, text gets strikethrough |
| D10 | User can cancel a task | ✅ | Via `⋯` dropdown → Cancel. Symbol stays `•`, text gets strikethrough + muted |
| D11 | User can migrate a task to another day or month | ✅ | Via `⋯` dropdown → "Migrate to day" (same month, reuses monthly parent) or "Migrate to month" (future month, marks old daily+monthly as migrated, creates new monthly entry in target) |
| D12 | User can inline-edit entry content by clicking it | ✅ | Click content → input field. Enter to save, Escape to cancel, blur to save |
| D13 | Content edits sync bidirectionally | ✅ | If entry has `parent_id` (linked to monthly), parent updates. If entry has children, children update. Uses `updateEntryWithSync` |
| D14 | User can delete an entry | ✅ | Hover → delete button (desktop), swipe-to-delete (mobile). Uses `deleteEntryWithSync` |
| D15 | Deleting syncs bidirectionally | ✅ | Deletes linked parent AND children |
| D16 | User can create subtasks with Tab/Shift+Tab | ⚠️ | Tab indents (sets `parent_id` to last root entry). Shift+Tab outdents. Visual indent only 1 level deep |
| D17 | Past incomplete tasks are flagged when viewing today | ✅ | Yellow banner at top showing incomplete tasks from previous days |
| D18 | User can migrate individual past incomplete tasks to today | ✅ | "Migrate" button per task in the banner. Same month: reuses monthly parent, updates date. Cross-month: marks old daily+monthly as migrated, creates new monthly parent + daily entry in current month |
| D19 | User can bulk-migrate all incomplete past tasks to today | ✅ | "Migrate all to today" button. Same cross-month logic as D18 |
| D20 | User can pull unassigned monthly tasks into today | ✅ | "Monthly" button → dialog showing open monthly tasks → checkbox select → "Add to today" |
| D21 | Completing/cancelling a daily task syncs to its parent monthly task | ✅ | Via `syncStatusToParent` |
| D22 | Entries update in realtime via Supabase subscription | ✅ | Channel listens to `entries` table changes for current date |
| D23 | Tasks created in the daily log automatically get a monthly parent entry. Both sync bidirectionally (content, status, delete) | ✅ | Monthly entry: log_type='monthly', date=YYYY-MM-01, status='migrated'. Daily entry gets parent_id → monthly. Only tasks, not events/notes |

### Daily Log Rules
- Entry types: `task` (default), `event` (`*` prefix), `note` (`-` prefix)
- Symbols: task=`•`, event=`⚬`, note=`–`
- Status symbols: open=type symbol, done=`×`, migrated=`>`, cancelled=`•` (strikethrough)
- Status transitions are EXPLICIT (via dropdown), NOT click-to-cycle
- All deletes use `deleteEntryWithSync` (cascades to linked entries)
- All content edits use `updateEntryWithSync` (syncs to linked entries)
- Status changes on linked entries (parent_id) use `syncStatusToParent` / `syncStatusToChild`

---

## 3. Monthly Log (`/monthly`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| M1 | User sees a two-panel layout: calendar (left) + tasks (right) | ✅ | |
| M2 | Calendar shows days 1-31 with day names | ✅ | Click any day → navigates to that day's daily log |
| M3 | Calendar shows only **events** as text for each day | ✅ | Filtered by `e.type === 'event'` |
| M4 | Calendar shows a **task count** per day | ✅ | e.g., `3 •` |
| M5 | User can navigate between months (prev/next arrows) | ✅ | |
| M6 | Today's date is highlighted in the calendar | ✅ | `bg-accent/30` |
| M7 | Weekend days are visually muted | ✅ | `text-muted-foreground` |
| M8 | Right panel "Monthly Tasks" shows ALL tasks for that month | ✅ | Combines: entries with `log_type='monthly'` or `'future'` (date=month-01) + entries with `log_type='daily'` and `type='task'` for dates in that month |
| M9 | Daily tasks show a `(Day X)` indicator | ✅ | To distinguish from monthly-level tasks |
| M10 | User can add a monthly-level task via input | ✅ | Creates entry with `log_type='monthly'`, `date=YYYY-MM-01` |
| M11 | User can complete a monthly task | ✅ | Via `⋯` dropdown → Complete. Syncs to linked daily entry if planned |
| M12 | User can cancel a monthly task | ✅ | Via `⋯` dropdown → Cancel. Syncs to linked daily entry if planned |
| M13 | User can plan a monthly task to a specific day | ✅ | Via `⋯` dropdown → Plan to day → day picker grid (1-31). Creates daily entry with `parent_id`. Max ONE day per task. Monthly task status → `migrated` (`>`) |
| M14 | Planned day shows as badge on the monthly task | ✅ | Clickable badge → jumps to that day |
| M15 | User can migrate a monthly task to another month | ✅ | Via `⋯` dropdown → Migrate to month → inline month picker panel. Original marked `migrated` (`>`), new monthly entry created in target month (unlinked) |
| M16 | User can delete a monthly task | ✅ | Delete button shown for terminal states (done/cancelled/migrated without children). Uses `deleteEntryWithSync` |
| M17 | Status changes on monthly tasks sync to linked daily entries | ✅ | Via `syncStatusToChild` |

### Monthly Log Rules
- Calendar left panel: ONLY events as text, task count as number
- Tasks right panel: ALL tasks (monthly-level + daily tasks from that month)
- Monthly tasks use `log_type='monthly'`, `date=YYYY-MM-01`
- Planning to a day: max ONE day per monthly task (upserts if already planned)
- Bidirectional sync: monthly ↔ daily via `parent_id` link
- `⋯` dropdown actions: Complete, Cancel, Plan to day, Migrate to month (NO click-to-cycle)

---

## 4. Future Log (`/future`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| F1 | Shows current month + next 6 months in a grid | ✅ | 7 cards total. Responsive: 1 col mobile, 2 col tablet, 3 col desktop |
| F2 | Each month card shows entries scheduled for it | ✅ | Queries entries with `log_type` IN `['future', 'monthly']` |
| F3 | User can add entries to any future month | ✅ | Input per card. Prefix parsing applies (`*` event, `-` note, default task) |
| F4 | User can complete/cancel entries | ✅ | Via `⋯` dropdown |
| F5 | User can delete entries | ✅ | Via hover delete button. Uses `deleteEntryWithSync` |
| F6 | Clicking a month name navigates to monthly log for that month | ✅ | |
| F7 | Entries added in monthly log show in future log and vice versa | ✅ | Both query `log_type IN ['monthly', 'future']` |

### Future Log Rules
- Shows current month + 6 future months (7 total)
- Future entries use `log_type='future'`, `date=YYYY-MM-01`
- Monthly and future entries are interchangeable in both views
- `⋯` dropdown actions: Complete, Cancel (NO click-to-cycle)

---

## 5. Meeting Notes Collection (`/collections/meetings`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| MN1 | User sees a list of meeting notes, newest first | ✅ | Data from `meeting_notes` table |
| MN2 | User can create a new meeting note | ✅ | Dialog with: title (required), date, attendees (comma-separated), agenda, notes |
| MN3 | Meeting notes are expandable to show full details | ✅ | Click to expand/collapse |
| MN4 | User can edit a meeting note | ✅ | Edit button → dialog |
| MN5 | User can delete a meeting note | ✅ | With confirmation |
| MN6 | Each meeting has an Action Items section | ✅ | Shown when expanded |
| MN7 | User can add action items to a meeting | ✅ | Input + "Add" button. Creates entry with `log_type='monthly'`, tagged with `meeting:<id>` |
| MN8 | Action items appear in the monthly log | ✅ | Because `log_type='monthly'` |
| MN9 | User can toggle action item status (open/done) | ✅ | Click to toggle |
| MN10 | User can migrate action items to daily log | ✅ | "Migrate" button → creates daily entry |
| MN11 | Meetings collection auto-creates on first visit | ✅ | `fetchCollectionByType` creates if not exists |

### Meeting Notes Rules
- Stored in `meeting_notes` table (NOT entries table)
- Action items are entries with `log_type='monthly'` and `tags=['meeting:<meeting_note_id>']`
- Action items do NOT use `parent_id` (FK constraint prevents it — meeting_note IDs ≠ entry IDs)
- Action items show in monthly tasks panel

---

## 6. Ideas Collection (`/collections/ideas`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| I1 | User sees a list of ideas with tags | ✅ | |
| I2 | User can quick-add an idea with comma-separated tags | ✅ | Input format: `idea text, tag1, tag2` |
| I3 | Ideas show tag badges | ✅ | |
| I4 | User can filter ideas by tag | ✅ | Tag bar, click to filter |
| I5 | User can edit an idea (content + tags) | ✅ | Edit dialog |
| I6 | User can delete an idea | ✅ | |
| I7 | User can promote an idea to a task in today's daily log | ✅ | Creates a daily entry for today |
| I8 | Ideas collection auto-creates on first visit | ✅ | |

### Ideas Rules
- Stored as entries with `log_type='collection'`, linked via `collection_id`
- Tags stored in `tags[]` array
- Promote to task: creates new entry with `log_type='daily'`, `date=today`

---

## 7. Custom Collections (`/collections/[id]` + `/collections/new`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| C1 | User can create a new custom collection | ✅ | Name + emoji icon. Via `/collections/new` or sidebar "+" button |
| C2 | Custom collections appear in sidebar immediately | ✅ | Sidebar refreshes on navigation |
| C3 | Custom collection page shows its entries | ✅ | |
| C4 | User can add entries via rapid logging input | ✅ | Same prefix parsing as daily log |
| C5 | User can edit/delete collection | ✅ | With confirmation dialog for delete |
| C6 | Deleting a collection deletes all its entries | ✅ | Cascade delete |

---

## 8. Settings (`/settings`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| S1 | User can toggle dark/light mode | ✅ | Persisted in localStorage. Inline script prevents flash on load |

---

## 9. Sidebar & Navigation

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| N1 | Desktop: fixed sidebar with nav links | ✅ | 264px wide |
| N2 | Mobile: hamburger menu (Sheet) | ✅ | |
| N3 | Nav links: Daily Log, Monthly Log, Future Log | ✅ | |
| N4 | Expandable Collections section | ✅ | Meeting Notes, Ideas, + custom collections |
| N5 | "+" button to create new collection | ✅ | |
| N6 | Settings link | ✅ | |
| N7 | Sign out button | ✅ | |
| N8 | Dark/light mode toggle in sidebar | ✅ | |
| N9 | Active page highlighted | ✅ | `bg-accent text-accent-foreground` |

---

## 10. Jarvis Admin API (`/api/jarvis/*`)

| # | User Story | Status | Rules |
|---|-----------|--------|-------|
| J1 | GET /api/jarvis/entries — list entries | ✅ | Params: `user_id`, `date`, `log_type` |
| J2 | POST /api/jarvis/entries — create entry | ✅ | Sets `source: 'jarvis'` |
| J3 | PATCH /api/jarvis/entries/[id] — update entry | ✅ | |
| J4 | DELETE /api/jarvis/entries/[id] — delete entry | ✅ | |
| J5 | GET /api/jarvis/collections — list collections | ✅ | |
| J6 | POST /api/jarvis/collections — create collection | ✅ | |
| J7 | GET /api/jarvis/collections/[id]/items — list items | ✅ | |
| J8 | POST /api/jarvis/collections/[id]/items — add item | ✅ | |
| J9 | POST /api/jarvis/migrate — migrate entry | ✅ | Marks original as migrated, creates copy |
| J10 | All endpoints require `X-API-Key` header | ✅ | |
| J11 | All endpoints scoped to `user_id` param | ✅ | Uses service role client (bypasses RLS) |

---

## 11. Cross-Cutting Rules

### Entry Types & Symbols
| Type | Input Prefix | Symbol | 
|------|-------------|--------|
| Task | (none) | `•` |
| Event | `*` | `⚬` |
| Note | `-` | `–` |

### Status States & Symbols
| Status | Symbol | Visual | Can transition to |
|--------|--------|--------|-------------------|
| open | type symbol | normal text | done, cancelled, migrated |
| done | `×` | strikethrough | — (terminal) |
| cancelled | `•` | strikethrough + muted | — (terminal) |
| migrated | `>` | normal | — (terminal, covers both "planned to day" and "moved to another month") |

### Bidirectional Sync Rules
1. **Content sync**: Editing content on any linked entry updates all linked entries (`updateEntryWithSync`)
2. **Delete sync**: Deleting any linked entry deletes all linked entries (`deleteEntryWithSync`)
3. **Status sync**: Completing/cancelling a daily entry with `parent_id` updates the parent monthly entry (`syncStatusToParent`). Completing/cancelling a monthly entry updates linked daily children (`syncStatusToChild`)
4. **Link mechanism**: `parent_id` on daily entries points to the source monthly entry ID (in `entries` table)
5. **Meeting action items**: Linked via `tags=['meeting:<meeting_note_id>']` (NOT `parent_id`, because meeting_note IDs are in a different table)

### Data Model Rules
- Monthly/future entries use `date=YYYY-MM-01` (first of month)
- Daily entries use the actual date `YYYY-MM-DD`
- Collection entries use `log_type='collection'` + `collection_id`
- `parent_id` FK references `entries(id)` only — never use for cross-table references
- Both monthly and future log views query `log_type IN ['monthly', 'future']`

---

## Not Yet Implemented
- ❌ Google Calendar integration (two-way sync)
- ❌ Apple Calendar (ICS feed)
- ❌ PWA (installable, offline support)
- ❌ Offline queue (IndexedDB → sync on reconnect)
- ❌ Month-end review flow (flagging incomplete monthly tasks)
- ❌ Search across all entries
- ❌ Repeating tasks
