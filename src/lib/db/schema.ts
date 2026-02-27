import { pgTable, uuid, text, date, integer, jsonb, timestamp, index, boolean, primaryKey } from 'drizzle-orm/pg-core';

// ============================================================
// Enums (as const arrays for type safety)
// ============================================================

export const entryTypeEnum = ['task', 'event', 'note'] as const;
export const entryStatusEnum = ['open', 'done', 'migrated', 'cancelled'] as const;
export const logTypeEnum = ['daily', 'monthly', 'future', 'collection'] as const;
export const collectionTypeEnum = ['meetings', 'ideas', 'custom'] as const;
export const entrySourceEnum = ['user', 'jarvis', 'calendar'] as const;

// ============================================================
// Auth.js Tables (Required by DrizzleAdapter)
// ============================================================

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable('account', {
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (account) => ({
  compoundKey: primaryKey({
    columns: [account.provider, account.providerAccountId],
  }),
}));

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (vt) => ({
  compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
}));

// ============================================================
// Application Tables
// ============================================================

/**
 * Allowed users (invite-only whitelist)
 */
export const allowedUsers = pgTable('allowed_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User profiles (linked to Auth.js users)
 */
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  googleRefreshToken: text('google_refresh_token'),
  settings: jsonb('settings').default({ theme: 'dark', defaultView: 'daily' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Collections (meetings, ideas, custom)
 */
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
 */
export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: entryTypeEnum }).notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: entryStatusEnum }).notNull().default('open'),
  logType: text('log_type', { enum: logTypeEnum }).notNull(),
  collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  monthlyId: uuid('monthly_id'),
  taskUid: uuid('task_uid').notNull(),
  tags: text('tags').array().default([]),
  position: integer('position').default(0),
  googleEventId: text('google_event_id'),
  source: text('source', { enum: entrySourceEnum }).default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxEntriesUserDate: index('idx_entries_user_date').on(table.userId, table.date),
  idxEntriesUserLogType: index('idx_entries_user_log_type').on(table.userId, table.logType),
  idxEntriesCollection: index('idx_entries_collection').on(table.collectionId),
  idxEntriesTaskUid: index('idx_entries_task_uid').on(table.taskUid),
  idxEntriesMonthlyId: index('idx_entries_monthly_id').on(table.monthlyId),
}));

/**
 * Meeting notes
 */
export const meetingNotes = pgTable('meeting_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
// Type Exports
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
