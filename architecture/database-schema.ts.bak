import { pgTable, uuid, text, date, integer, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// Enums (as const arrays for type safety)
// ============================================================

export const entryTypeEnum = ['task', 'event', 'note'] as const;
export const entryStatusEnum = ['open', 'done', 'migrated', 'cancelled'] as const;
export const logTypeEnum = ['daily', 'monthly', 'future', 'collection'] as const;
export const collectionTypeEnum = ['meetings', 'ideas', 'custom'] as const;
export const entrySourceEnum = ['user', 'jarvis', 'calendar'] as const;

// ============================================================
// Tables
// ============================================================

/**
 * Allowed users (invite-only whitelist)
 * Checked during Auth.js sign-in callback
 */
export const allowedUsers = pgTable('allowed_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User profiles
 * Linked to Auth.js users via id (which matches the auth provider's user id)
 * Created/updated in Auth.js callbacks
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  googleRefreshToken: text('google_refresh_token'),
  settings: jsonb('settings').default({ theme: 'dark', defaultView: 'daily' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // No additional indexes needed - id is PK
}));

/**
 * Collections (meetings, ideas, custom)
 * User-created containers for entries
 */
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: collectionTypeEnum }).notNull().default('custom'),
  icon: text('icon').default('📋'),
  template: jsonb('template'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxCollectionsUser: index('idx_collections_user').on(table.userId),
}));

/**
 * Entries - Core bullet journal entries
 * 
 * CRITICAL RELATIONSHIPS:
 * - task_uid: Chain identity. ALL copies of a task share this (D23 parent+child, 
 *   migrations across months). NEVER breaks across copies.
 * - monthly_id: Within-month sync. Links daily entries to their monthly parent.
 *   NULL for monthly/future/collection entries.
 * 
 * NUCLEAR DELETE:
 * DELETE FROM entries WHERE task_uid = X
 * Kills entire chain across all months.
 */
export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  type: text('type', { enum: entryTypeEnum }).notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: entryStatusEnum }).notNull().default('open'),
  logType: text('log_type', { enum: logTypeEnum }).notNull(),
  collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  
  // Monthly link: daily entries point to their monthly parent
  // Only within-month, never cross-month
  monthlyId: uuid('monthly_id').references(() => entries.id, { onDelete: 'cascade' }),
  
  // Chain identity: shared across ALL copies of a task (D23, migrations)
  taskUid: uuid('task_uid').notNull(),
  
  tags: text('tags').array().default([]),
  position: integer('position').default(0),
  googleEventId: text('google_event_id'),
  source: text('source', { enum: entrySourceEnum }).default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // For daily log queries
  idxEntriesUserDate: index('idx_entries_user_date').on(table.userId, table.date),
  
  // For monthly/future log queries
  idxEntriesUserLogType: index('idx_entries_user_log_type').on(table.userId, table.logType),
  
  // For collection entries
  idxEntriesCollection: index('idx_entries_collection').on(table.collectionId),
  
  // CRITICAL: For nuclear delete and chain resolution
  idxEntriesTaskUid: index('idx_entries_task_uid').on(table.taskUid),
  
  // For bidirectional sync queries
  idxEntriesMonthlyId: index('idx_entries_monthly_id').on(table.monthlyId),
}));

/**
 * Meeting notes
 * Separate table for meeting-specific data
 * Action items stored as entries with tags=['meeting:<id>']
 */
export const meetingNotes = pgTable('meeting_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  title: text('title').notNull(),
  attendees: text('attendees').array().default([]),
  agenda: text('agenda'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxMeetingNotesCollection: index('idx_meeting_notes_collection').on(table.collectionId),
  idxMeetingNotesUser: index('idx_meeting_notes_user').on(table.userId),
}));

// ============================================================
// Relations
// ============================================================

export const profilesRelations = relations(profiles, ({ many }) => ({
  entries: many(entries),
  collections: many(collections),
  meetingNotes: many(meetingNotes),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(profiles, {
    fields: [collections.userId],
    references: [profiles.id],
  }),
  entries: many(entries),
  meetingNotes: many(meetingNotes),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  user: one(profiles, {
    fields: [entries.userId],
    references: [profiles.id],
  }),
  collection: one(collections, {
    fields: [entries.collectionId],
    references: [collections.id],
  }),
  // Self-referential: daily entries point to monthly parent
  monthlyParent: one(entries, {
    fields: [entries.monthlyId],
    references: [entries.id],
    relationName: 'monthlyChildren',
  }),
  // Monthly entries have many daily children
  dailyChildren: many(entries, {
    relationName: 'monthlyChildren',
  }),
}));

export const meetingNotesRelations = relations(meetingNotes, ({ one }) => ({
  collection: one(collections, {
    fields: [meetingNotes.collectionId],
    references: [collections.id],
  }),
  user: one(profiles, {
    fields: [meetingNotes.userId],
    references: [profiles.id],
  }),
}));

// ============================================================
// Type Exports (for TypeScript)
// ============================================================

export type AllowedUser = typeof allowedUsers.$inferSelect;
export type NewAllowedUser = typeof allowedUsers.$inferInsert;

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

export type MeetingNote = typeof meetingNotes.$inferSelect;
export type NewMeetingNote = typeof meetingNotes.$inferInsert;

// ============================================================
// Schema Notes for Developer
// ============================================================

/**
 * TASK_UID (Chain Identity)
 * =========================
 * - Generated with crypto.randomUUID() or gen_random_uuid()
 * - Never changes across copies of a task
 * - D23 auto-creation: parent and child share task_uid
 * - planToDay: child inherits parent's task_uid
 * - migrateEntry: new peer shares task_uid
 * - migrateToMonth: new monthly entry keeps task_uid
 * 
 * Nuclear Delete Pattern:
 * await db.delete(entries).where(eq(entries.taskUid, taskUid));
 * This deletes ALL entries in the chain across all months.
 */

/**
 * MONTHLY_ID (Within-Month Sync)
 * ==============================
 * - Only set on daily entries (log_type='daily', type='task')
 * - Points to the monthly parent entry
 * - Used for bidirectional sync (content, status)
 * - Cross-month linking is handled by task_uid, NOT monthly_id
 * 
 * D23 Invariant: Every daily task MUST have monthly_id
 * (either from D23 auto-creation or planToDay)
 */

/**
 * MIGRATED ENTRIES
 * ================
 * - status='migrated' means entry is read-only
 * - No content edits allowed
 * - No status changes allowed
 * - Visual: muted text, strikethrough if chain resolved
 * 
 * Chain Resolution Check:
 * Check if any entry with same task_uid has status in ['done', 'cancelled']
 * fetchChainResolutions(taskUids: string[]) → Record<taskUid, status>
 */

/**
 * DATE HANDLING
 * =============
 * - Daily entries: actual date (YYYY-MM-DD)
 * - Monthly entries: YYYY-MM-01 (first of month)
 * - Future entries: YYYY-MM-01 (first of target month)
 * - D23 parents: actual date (same as child)
 * 
 * Query patterns:
 * - Daily log: eq(date, '2024-01-15')
 * - Monthly log: gte(date, '2024-01-01') AND lte(date, '2024-01-31')
 * - Future log: gte(date, '2024-01-01')
 */

/**
 * INDEX USAGE
 * ===========
 * idx_entries_user_date: Daily log, past incomplete queries
 * idx_entries_user_log_type: Monthly, future log queries
 * idx_entries_collection: Collection entries
 * idx_entries_task_uid: Nuclear delete, chain resolution
 * idx_entries_monthly_id: Bidirectional sync queries
 * idx_collections_user: User's collections list
 * idx_meeting_notes_collection: Meeting notes for collection
 */
