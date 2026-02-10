/**
 * db/schema.ts
 * -----------
 * Esquema unificado Local-first para SQLite (Drizzle ORM).
 * Incluye tablas de Better-Auth + dominio de torneos.
 *
 * SQLite es la fuente de verdad local; la sincronización con
 * Supabase (PostgreSQL) se realiza vía HTTP push/pull.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums como constantes (evitamos TypeScript enums por convención)
// ---------------------------------------------------------------------------

export const SyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
} as const;
export type SyncStatusType = (typeof SyncStatus)[keyof typeof SyncStatus];

export const BracketType = {
  WINNERS: 'WINNERS',
  LOSERS: 'LOSERS',
  GRAND_FINAL: 'GRAND_FINAL',
} as const;
export type BracketTypeValue = (typeof BracketType)[keyof typeof BracketType];

export const TournamentStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
export type TournamentStatusType =
  (typeof TournamentStatus)[keyof typeof TournamentStatus];

export const TournamentType = {
  SINGLE_ELIMINATION: 'single_elimination',
  DOUBLE_ELIMINATION: 'double_elimination',
} as const;
export type TournamentTypeValue =
  (typeof TournamentType)[keyof typeof TournamentType];

// ---------------------------------------------------------------------------
// Better-Auth Core Tables
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: text('access_token_expires_at'),
  refreshTokenExpiresAt: text('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---------------------------------------------------------------------------
// Domain Tables — Tournaments
// ---------------------------------------------------------------------------

export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey(),
  organizerId: text('organizer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull().$type<TournamentTypeValue>(),
  status: text('status')
    .notNull()
    .$type<TournamentStatusType>()
    .default(TournamentStatus.DRAFT),
  bestOf: integer('best_of').notNull().default(1),
  maxParticipants: integer('max_participants').notNull().default(16),

  // Sync metadata
  syncStatus: text('sync_status')
    .notNull()
    .$type<SyncStatusType>()
    .default(SyncStatus.PENDING),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  lastSyncedAt: text('last_synced_at'),
});

// ---------------------------------------------------------------------------
// Domain Tables — Participants
// ---------------------------------------------------------------------------

export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),

  // Identidad del participante
  nickname: text('nickname').notNull(),
  /** Correo electrónico capturado por el organizador (claimedEmail). */
  email: text('email'),
  /**
   * FK al usuario registrado que reclamó este perfil casual.
   * Solo se establece cuando el participante completa el flujo
   * de verificación de correo ANTES de que el torneo pase a 'active'.
   */
  linkedUserId: text('linked_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),

  seed: integer('seed'),
  isBye: integer('is_bye', { mode: 'boolean' }).notNull().default(false),

  // Sync metadata
  syncStatus: text('sync_status')
    .notNull()
    .$type<SyncStatusType>()
    .default(SyncStatus.PENDING),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  lastSyncedAt: text('last_synced_at'),
});

// ---------------------------------------------------------------------------
// Domain Tables — Matches
// ---------------------------------------------------------------------------

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),

  round: integer('round').notNull(),
  position: integer('position').notNull(),
  bracketType: text('bracket_type')
    .notNull()
    .$type<BracketTypeValue>()
    .default(BracketType.WINNERS),

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

  /** Siguiente match al que avanza el ganador. */
  nextMatchId: text('next_match_id'),
  /** Match de Losers Bracket al que cae el perdedor (Double Elimination). */
  loserNextMatchId: text('loser_next_match_id'),

  // Sync metadata
  syncStatus: text('sync_status')
    .notNull()
    .$type<SyncStatusType>()
    .default(SyncStatus.PENDING),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  lastSyncedAt: text('last_synced_at'),
});

// ---------------------------------------------------------------------------
// Inferred Types (para uso en repositorios y servicios)
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
