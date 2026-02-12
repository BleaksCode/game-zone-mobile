/**
 * modules/matches/repository.ts
 * --------------------------------
 * Capa de acceso a datos para la tabla `matches`.
 * Opera contra SQLite local vía Drizzle ORM.
 */

import { eq, and } from 'drizzle-orm';
import { getLocalDb } from '@/db/client';
import {
  matches,
  SyncStatus,
  type Match,
  type NewMatch,
  type BracketTypeValue,
} from '@/src/db/schema';
import * as Crypto from 'expo-crypto';

export const MatchRepository = {
  /**
   * Crea un único match.
   */
  create: async (
    data: Omit<NewMatch, 'createdAt' | 'updatedAt' | 'syncStatus'>,
  ): Promise<Match> => {
    const now = new Date().toISOString();

    const newMatch: NewMatch = {
      ...data,
      syncStatus: SyncStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    await getLocalDb.insert(matches).values(newMatch);
    return MatchRepository.getById(data.id) as Promise<Match>;
  },

  /**
   * Crea múltiples matches en una sola transacción.
   * Usado por TournamentLogicService al generar brackets.
   */
  createMany: async (
    matchesData: Omit<NewMatch, 'createdAt' | 'updatedAt' | 'syncStatus'>[],
  ): Promise<void> => {
    const now = new Date().toISOString();

    const withTimestamps: NewMatch[] = matchesData.map((m) => ({
      ...m,
      syncStatus: SyncStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    }));

    // Inserción en lotes de 50 para evitar límites de SQLite
    const BATCH_SIZE = 50;
    for (let i = 0; i < withTimestamps.length; i += BATCH_SIZE) {
      const batch = withTimestamps.slice(i, i + BATCH_SIZE);
      await getLocalDb.insert(matches).values(batch);
    }
  },

  /**
   * Obtiene un match por ID.
   */
  getById: async (id: string): Promise<Match | undefined> => {
    const results = await getLocalDb
      .select()
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);
    return results[0];
  },

  /**
   * Obtiene todos los matches de un torneo.
   */
  getByTournamentId: async (tournamentId: string): Promise<Match[]> => {
    return getLocalDb
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));
  },

  /**
   * Obtiene matches de un bracket específico.
   */
  getByBracketType: async (
    tournamentId: string,
    bracketType: BracketTypeValue,
  ): Promise<Match[]> => {
    return getLocalDb
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.bracketType, bracketType),
        ),
      );
  },

  /**
   * Obtiene registros pendientes de sincronización.
   */
  getPendingSync: async (): Promise<Match[]> => {
    return getLocalDb
      .select()
      .from(matches)
      .where(eq(matches.syncStatus, SyncStatus.PENDING));
  },

  /**
   * Actualiza el score y ganador de un match.
   */
  updateScore: async (
    id: string,
    player1Score: number,
    player2Score: number,
    winnerId: string,
  ): Promise<void> => {
    const now = new Date().toISOString();
    await getLocalDb
      .update(matches)
      .set({
        player1Score,
        player2Score,
        winnerId,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(matches.id, id));
  },

  /**
   * Actualiza un jugador en un asiento específico del match.
   */
  seatPlayer: async (
    matchId: string,
    seat: 'player1Id' | 'player2Id',
    playerId: string | null,
  ): Promise<void> => {
    const now = new Date().toISOString();
    await getLocalDb
      .update(matches)
      .set({
        [seat]: playerId,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(matches.id, matchId));
  },

  /**
   * Actualiza el winnerId de un match (usado en autoProcessByes).
   */
  setWinner: async (matchId: string, winnerId: string | null): Promise<void> => {
    const now = new Date().toISOString();
    await getLocalDb
      .update(matches)
      .set({
        winnerId,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(matches.id, matchId));
  },

  /**
   * Marca registros como sincronizados.
   */
  markSynced: async (ids: string[]): Promise<void> => {
    const now = new Date().toISOString();
    for (const id of ids) {
      await getLocalDb
        .update(matches)
        .set({
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: now,
        })
        .where(eq(matches.id, id));
    }
  },

  /**
   * Upsert desde datos remotos (pull).
   */
  upsertFromRemote: async (remoteMatches: Match[]): Promise<void> => {
    for (const m of remoteMatches) {
      const existing = await MatchRepository.getById(m.id);
      if (existing) {
        if (m.updatedAt && existing.updatedAt && m.updatedAt > existing.updatedAt) {
          await getLocalDb
            .update(matches)
            .set({
              ...m,
              syncStatus: SyncStatus.SYNCED,
              lastSyncedAt: new Date().toISOString(),
            })
            .where(eq(matches.id, m.id));
        }
      } else {
        await getLocalDb.insert(matches).values({
          ...m,
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
  },

  /**
   * Elimina todos los matches de un torneo.
   */
  deleteByTournamentId: async (tournamentId: string): Promise<void> => {
    await getLocalDb
      .delete(matches)
      .where(eq(matches.tournamentId, tournamentId));
  },
};
