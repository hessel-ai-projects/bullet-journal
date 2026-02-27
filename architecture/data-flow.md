# Bullet Journal — Data Flow Documentation

## Overview

This document describes the complex data flows for the Bullet Journal system, focusing on the critical operations that maintain data consistency across the task chain system.

---

## 1. D23 Auto-Creation Flow

**Trigger:** User creates a daily task (type='task', log_type='daily') without an existing monthly_id

**User Story:** D23 — Tasks created in daily log auto-create a monthly parent

### Flow Diagram

```
User types task + Enter
         │
         ▼
┌────────────────────┐
│ createEntry()      │
│ • type='task'      │
│ • log_type='daily' │
│ • no monthly_id    │
└────────┬───────────┘
         │
         ▼
┌─────────────────────────────┐
│ D23 CHECK:                  │
│ params.type === 'task'      │
│ && params.log_type === 'daily'
│ && !params.monthly_id       │
└────────┬────────────────────┘
         │ YES
         ▼
┌─────────────────────────────┐
│ Generate shared task_uid    │
│ const sharedUid = crypto    │
│   .randomUUID()             │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Fetch existing monthly      │
│ entries for this month      │
│ (for position calculation)  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ INSERT monthly parent       │
│ • user_id: session.user.id  │
│ • type: 'task'              │
│ • content: same as daily    │
│ • log_type: 'monthly'       │
│ • date: params.date         │
│ • position: existing.length │
│ • status: 'open'            │
│ • task_uid: sharedUid       │
│ • monthly_id: null          │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ monthlyEntry created        │
│ monthlyId = monthlyEntry.id │
│ taskUid = sharedUid         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ INSERT daily entry          │
│ • user_id: session.user.id  │
│ • type: 'task'              │
│ • content: params.content   │
│ • log_type: 'daily'         │
│ • date: params.date         │
│ • position: params.position │
│ • monthly_id: monthlyId     │
│ • task_uid: taskUid         │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

### Resulting Data Structure

```sql
-- Monthly parent (created by D23)
SELECT * FROM entries WHERE id = 'monthly-uuid';
-- id: 'monthly-uuid'
-- type: 'task'
-- log_type: 'monthly'
-- monthly_id: null
-- task_uid: 'shared-uuid-123'
-- status: 'open'
-- date: '2024-01-15'

-- Daily child
SELECT * FROM entries WHERE id = 'daily-uuid';
-- id: 'daily-uuid'
-- type: 'task'
-- log_type: 'daily'
-- monthly_id: 'monthly-uuid'  <-- links to parent
-- task_uid: 'shared-uuid-123' <-- same as parent
-- status: 'open'
-- date: '2024-01-15'
```

### Invariants Enforced

1. **Every daily task has a monthly_id** — enforced by D23
2. **Parent and child share task_uid** — enables nuclear delete
3. **Monthly parent has null monthly_id** — it's the root

---

## 2. Bidirectional Sync Flow

### 2a. Content Sync (Daily → Monthly)

**Trigger:** User edits content of a daily entry

**User Story:** D14 — Content edits sync bidirectionally

```
User clicks entry → edits → saves
         │
         ▼
┌─────────────────────────────┐
│ updateEntryWithSync()       │
│ • id: dailyEntryId          │
│ • updates: { content }      │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Check if migrated           │
│ SELECT status FROM entries  │
│ WHERE id = dailyEntryId     │
└────────┬────────────────────┘
         │
         ▼
    ┌────────┐
    │migrated│──YES──▶ Return false (read-only)
    └────┬───┘
         │ NO
         ▼
┌─────────────────────────────┐
│ UPDATE entry SET content    │
│ WHERE id = dailyEntryId     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ IF updates.content exists   │
│ syncFields.content = updates.content
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Get monthly_id              │
│ SELECT monthly_id FROM      │
│ entries WHERE id = dailyId  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ IF monthly_id exists:       │
│   UPDATE entries SET        │
│   content = syncFields.content
│   WHERE id = monthly_id     │
│   AND status != 'migrated'  │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

### 2b. Status Sync (Monthly → Daily Children)

**Trigger:** User completes/cancels a monthly task

**User Story:** M10-M11 — Complete/cancel monthly task syncs to daily children

```
User clicks "Complete" on monthly task
         │
         ▼
┌─────────────────────────────┐
│ syncStatusToChild()         │
│ • monthlyEntryId            │
│ • newStatus: 'done'         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Find all daily children     │
│ SELECT id, status FROM      │
│ entries WHERE monthly_id =  │
│ monthlyEntryId AND          │
│ log_type = 'daily'          │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ For each child:             │
│   IF child.status != 'migrated'
│     UPDATE entries SET      │
│     status = newStatus      │
│     WHERE id = child.id     │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

### 2c. Status Sync (Daily → Monthly Parent + Peers)

**Trigger:** User completes/cancels a daily task

**User Story:** D21 — Completing/cancelling daily task syncs to monthly + peers

```
User clicks "Complete" on daily task
         │
         ▼
┌─────────────────────────────┐
│ syncStatusToParent()        │
│ • dailyEntryId              │
│ • newStatus: 'done'         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Get monthly_id              │
│ SELECT monthly_id FROM      │
│ entries WHERE id = dailyId  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Find all non-migrated peers │
│ (same monthly_id, excluding │
│ the triggering entry)       │
│ SELECT id, status FROM      │
│ entries WHERE monthly_id =  │
│ monthlyId AND log_type =    │
│ 'daily' AND id != dailyId   │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ For each peer:              │
│   IF peer.status != 'migrated'
│     UPDATE entries SET      │
│     status = newStatus      │
│     WHERE id = peer.id      │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Update monthly parent       │
│ UPDATE entries SET          │
│ status = newStatus          │
│ WHERE id = monthlyId        │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

### Sync Rules Summary

| Action | Sync Direction | Skips Migrated |
|--------|---------------|----------------|
| Edit content (daily) | Daily → Monthly | Yes |
| Edit content (monthly) | Not synced to children | N/A |
| Complete/cancel (daily) | Daily → Monthly + Peer Dailies | Yes |
| Complete/cancel (monthly) | Monthly → All Daily Children | Yes |

---

## 3. Migration Flows

### 3a. Within-Month Migration

**Trigger:** User migrates task to another day in same month

**User Story:** D11 — Migrate to day (same month)

```
User clicks "Migrate to day" → picks date
         │
         ▼
┌─────────────────────────────┐
│ migrateEntry()              │
│ • id: originalEntryId       │
│ • newDate: '2024-01-20'     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Determine if cross-month    │
│ origMonth = entry.date.slice(0,7)
│ newMonth = newDate.slice(0,7)
└────────┬────────────────────┘
         │
    ┌────┴────┐
    │different│──YES──▶ migrateToMonth()
    └────┬────┘
         │ same month
         ▼
┌─────────────────────────────┐
│ Get monthly_id              │
│ SELECT monthly_id FROM      │
│ entries WHERE id = originalId
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ CHECK: Peer at target date? │
│ SELECT * FROM entries       │
│ WHERE monthly_id = monthlyId│
│ AND date = newDate          │
│ AND log_type = 'daily'      │
└────────┬────────────────────┘
         │
    ┌────┴────┐
    │ exists  │──YES──▶ Reactivate peer
    └────┬────┘         UPDATE status='open'
         │ no peer      WHERE id = peer.id
         ▼
┌─────────────────────────────┐
│ Create new daily entry      │
│ INSERT INTO entries (...)   │
│ • same content              │
│ • same monthly_id           │
│ • same task_uid             │
│ • date = newDate            │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Delete future peers         │
│ DELETE FROM entries         │
│ WHERE monthly_id = monthlyId│
│ AND log_type = 'daily'      │
│ AND date > newDate          │
│ AND id != result.id         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Mark source as migrated     │
│ IF original.date < newDate: │
│   UPDATE status='migrated'  │
│ ELSE:                       │
│   DELETE original           │
│ (going backwards = delete)  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Update monthly parent date  │
│ UPDATE entries SET date =   │
│ newDate WHERE id = monthlyId│
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

**Key Behaviors:**
- Peer-based: If entry exists at target date, reactivate it (don't duplicate)
- Deletes future peers after the target date (no gaps)
- Source marked migrated only if moving forward in time
- Monthly parent date updated to reflect new assignment

### 3b. Cross-Month Migration

**Trigger:** User migrates task to a different month

**User Story:** D12, M14 — Migrate to month

```
User clicks "Migrate to month" → picks month
         │
         ▼
┌─────────────────────────────┐
│ migrateToMonth()            │
│ • entryId: originalId       │
│ • targetMonthDate:          │
│   '2024-02-01'              │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Fetch original entry        │
│ SELECT * FROM entries       │
│ WHERE id = entryId          │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Determine entry type:       │
│ IF original.monthly_id:     │
│   → Daily entry             │
│ ELIF log_type IN            │
│   ['monthly','future']:     │
│   → Monthly/future entry    │
└────────┬────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌─────────────┐     ┌─────────────────────┐
│Daily Entry  │     │Monthly/Future Entry │
└──────┬──────┘     └──────────┬──────────┘
       │                       │
       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│Mark ALL peers + │     │Mark children as │
│monthly as       │     │migrated         │
│migrated         │     │                 │
│                 │     │UPDATE entries   │
│UPDATE entries   │     │SET status='migr'
│SET status='migr'│     │WHERE monthly_id= │
│WHERE monthly_id=│     │  original.id AND│
│  original.monthly_id│ │  log_type='daily'
│AND log_type='daily' │  │                 │
│                 │     │Mark self as     │
│Mark monthly as  │     │migrated         │
│migrated         │     │                 │
│                 │     │UPDATE entries   │
│UPDATE entries   │     │SET status='migr'│
│SET status='migr'│     │WHERE id = entryId
│WHERE id =       │     └─────────────────┘
│  original.monthly_id     │
└─────────────────┘        │
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
┌─────────────────────────────┐
│ Create new monthly entry    │
│ in target month             │
│                             │
│ INSERT INTO entries (...)   │
│ • user_id: same             │
│ • type: same                │
│ • content: same             │
│ • log_type: 'monthly'       │
│ • date: '2024-02-01'        │
│ • position: calculated      │
│ • status: 'open'            │
│ • task_uid: SAME (preserve! │
│ • monthly_id: null          │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

**Key Behaviors:**
- Old chain marked as migrated (read-only)
- New monthly entry has SAME task_uid (chain preserved)
- New entry is unlinked (no monthly_id) — fresh start
- Children of old monthly entry are also marked migrated

---

## 4. Nuclear Delete Flow

**Trigger:** User deletes any entry

**User Story:** D16 — Deleting any entry deletes ENTIRE chain

```
User clicks delete (trash icon or swipe)
         │
         ▼
┌─────────────────────────────┐
│ deleteEntryWithSync()       │
│ • id: entryId               │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Fetch entry's task_uid      │
│ SELECT task_uid FROM        │
│ entries WHERE id = entryId  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ NUCLEAR DELETE              │
│                             │
│ DELETE FROM entries         │
│ WHERE task_uid = :taskUid   │
│                             │
│ This deletes:               │
│ • The entry itself          │
│ • Monthly parent (if any)   │
│ • All daily children        │
│ • All migrated copies       │
│ • Across ALL months         │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

**Result Example:**

```sql
-- Before delete
SELECT id, log_type, status, task_uid FROM entries WHERE task_uid = 'abc-123';
-- id: monthly-jan   | log_type: monthly | status: migrated  | task_uid: abc-123
-- id: daily-jan-15  | log_type: daily   | status: migrated  | task_uid: abc-123
-- id: monthly-feb   | log_type: monthly | status: open      | task_uid: abc-123
-- id: daily-feb-20  | log_type: daily   | status: open      | task_uid: abc-123

-- After DELETE WHERE task_uid = 'abc-123'
SELECT * FROM entries WHERE task_uid = 'abc-123';
-- (0 rows)
```

---

## 5. Chain Resolution Flow

**Trigger:** Rendering migrated entries to check if chain is resolved

**User Story:** M16 — Migrated tasks show resolved visual

```
Monthly log renders
         │
         ▼
┌─────────────────────────────┐
│ fetchMonthlyEntries()       │
│ returns entries including   │
│ migrated ones               │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Collect task_uids of        │
│ migrated entries            │
│ const migratedUids = entries│
│   .filter(e => e.status === │
│     'migrated')             │
│   .map(e => e.task_uid)     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ fetchChainResolutions()     │
│ • taskUids: migratedUids    │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Query for resolved chains   │
│ SELECT task_uid, status     │
│ FROM entries                │
│ WHERE task_uid IN (uids)    │
│ AND status IN               │
│   ('done', 'cancelled')     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Build resolution map        │
│ Record<task_uid, status>    │
│ {                           │
│   'abc-123': 'done',        │
│   'def-456': 'cancelled'    │
│ }                           │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Render migrated entries:    │
│ IF resolutionMap[task_uid]: │
│   → strikethrough + muted   │
│ ELSE:                       │
│   → just muted              │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

**Visual Indicators:**

| State | Visual |
|-------|--------|
| Migrated, chain open | Muted text, `>` symbol |
| Migrated, chain done | Strikethrough + muted, `>` symbol |
| Migrated, chain cancelled | Strikethrough + muted, `>` symbol |

---

## 6. Plan to Day Flow

**Trigger:** User plans a monthly task to a specific day

**User Story:** M12 — Plan to day

```
User clicks "Plan to day" on monthly task
         │
         ▼
┌─────────────────────────────┐
│ planToDay()                 │
│ • monthlyEntryId            │
│ • date: '2024-01-20'        │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Check for existing children │
│ SELECT * FROM entries       │
│ WHERE monthly_id = monthlyId│
│ AND log_type = 'daily'      │
│ AND status != 'migrated'    │
└────────┬────────────────────┘
         │
    ┌────┴────┐
    │ exists  │──YES──▶ Move existing child
    └────┬────┘         UPDATE date = newDate
         │ no child
         ▼
┌─────────────────────────────┐
│ Fetch monthly entry details │
│ SELECT * FROM entries       │
│ WHERE id = monthlyEntryId   │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Create daily child          │
│ INSERT INTO entries (...)   │
│ • user_id: same             │
│ • type: monthly.type        │
│ • content: monthly.content  │
│ • log_type: 'daily'         │
│ • date: target date         │
│ • monthly_id: monthlyId     │
│ • task_uid: monthly.task_uid│
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Update monthly parent date  │
│ UPDATE entries SET date =   │
│ targetDate WHERE id =       │
│ monthlyEntryId              │
└────────┬────────────────────┘
         │
         ▼
    ┌─────────┐
    │  DONE   │
    └─────────┘
```

**Key Behaviors:**
- Max one active daily child per monthly task
- Re-planning moves the existing child
- Monthly parent date updated to match assignment
- Daily child inherits task_uid from parent

---

## Transaction Safety

All multi-step operations should use Drizzle transactions:

```typescript
// Example: Nuclear delete within transaction
await db.transaction(async (tx) => {
  const [entry] = await tx
    .select({ taskUid: entries.taskUid })
    .from(entries)
    .where(eq(entries.id, entryId));
  
  if (!entry) throw new Error('Entry not found');
  
  await tx
    .delete(entries)
    .where(eq(entries.taskUid, entry.taskUid));
});

// Example: D23 creation within transaction
await db.transaction(async (tx) => {
  const sharedUid = crypto.randomUUID();
  
  // Insert monthly parent
  const [monthly] = await tx
    .insert(entries)
    .values({
      userId: session.user.id,
      type: 'task',
      content,
      logType: 'monthly',
      date,
      taskUid: sharedUid,
    })
    .returning();
  
  // Insert daily child
  await tx
    .insert(entries)
    .values({
      userId: session.user.id,
      type: 'task',
      content,
      logType: 'daily',
      date,
      monthlyId: monthly.id,
      taskUid: sharedUid,
    });
});
```
