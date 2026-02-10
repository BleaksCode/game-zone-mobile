/**
 * db/remote-schema.ts
 * --------------------
 * Esquema PostgreSQL para Supabase.
 * Utilizado exclusivamente en las API Routes del servidor.
 * Refleja la misma estructura lógica que schema.ts pero con tipos nativos de Postgres.
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Better-Auth Core Tables (PostgreSQL)
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Domain Tables (PostgreSQL)
// ---------------------------------------------------------------------------

export const tournaments = pgTable('tournaments', {
  id: text('id').primaryKey(),
  organizerId: text('organizer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('draft'),
  bestOf: integer('best_of').notNull().default(1),
  maxParticipants: integer('max_participants').notNull().default(16),
  syncStatus: text('sync_status').notNull().default('SYNCED'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastSyncedAt: timestamp('last_synced_at'),
});

export const participants = pgTable('participants', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  email: text('email'),
  linkedUserId: text('linked_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  seed: integer('seed'),
  isBye: boolean('is_bye').notNull().default(false),
  syncStatus: text('sync_status').notNull().default('SYNCED'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastSyncedAt: timestamp('last_synced_at'),
});

export const matches = pgTable('matches', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  position: integer('position').notNull(),
  bracketType: text('bracket_type').notNull().default('WINNERS'),
  player1Id: text('player1_id').references(() => participants.id, {
    onDelete: 'set null',
  }),
  player2Id: text('player2_id').references(() => participants.id, {
    onDelete: 'set null',
  }),
  player1Score: integer('player1_score'),
  player2Score: integer('player2_score'),
  winnerId: text('winner_id').references(() => participants.id, {
    onDelete: 'set null',
  }),
  nextMatchId: text('next_match_id'),
  loserNextMatchId: text('loser_next_match_id'),
  syncStatus: text('sync_status').notNull().default('SYNCED'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastSyncedAt: timestamp('last_synced_at'),
});
