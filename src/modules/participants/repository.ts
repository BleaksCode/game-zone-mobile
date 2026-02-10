/**
 * modules/participants/repository.ts
 * ------------------------------------
 * Capa de acceso a datos para la tabla `participants`.
 * Opera contra SQLite local vía Drizzle ORM.
 */

import { eq, and } from 'drizzle-orm';
import { getLocalDb } from '@/db/client'; // <--- CAMBIO AQUÍ
import {
  participants,
  SyncStatus,
  type Participant,
  type NewParticipant,
} from '@/db/schema';
import * as Crypto from 'expo-crypto';

export const ParticipantRepository = {
  /**
   * Crea un nuevo participante.
   */
  create: async (
    data: Omit<NewParticipant, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
  ): Promise<Participant> => {
    const db = getLocalDb(); // <--- OBTENER DB
    if (!db) throw new Error('Base de datos local no disponible');

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newParticipant: NewParticipant = {
      ...data,
      id,
      syncStatus: SyncStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(participants).values(newParticipant);
    return ParticipantRepository.getById(id) as Promise<Participant>;
  },

  /**
   * Crea un participante BYE (fantasma) para completar potencias de 2.
   */
  createBye: async (tournamentId: string, seed: number): Promise<Participant> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    const byeParticipant: NewParticipant = {
      id,
      tournamentId,
      nickname: 'BYE',
      isBye: true,
      seed,
      syncStatus: SyncStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(participants).values(byeParticipant);
    return ParticipantRepository.getById(id) as Promise<Participant>;
  },

  /**
   * Obtiene un participante por ID.
   */
  getById: async (id: string): Promise<Participant | undefined> => {
    const db = getLocalDb();
    if (!db) return undefined; // Fail-safe si no hay DB

    const results = await db
      .select()
      .from(participants)
      .where(eq(participants.id, id))
      .limit(1);
    return results[0];
  },

  /**
   * Obtiene todos los participantes de un torneo.
   */
  getByTournamentId: async (tournamentId: string): Promise<Participant[]> => {
    const db = getLocalDb();
    if (!db) return [];

    return db
      .select()
      .from(participants)
      .where(eq(participants.tournamentId, tournamentId));
  },

  /**
   * Obtiene solo participantes reales (no BYE) de un torneo.
   */
  getRealByTournamentId: async (tournamentId: string): Promise<Participant[]> => {
    const db = getLocalDb();
    if (!db) return [];

    return db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.tournamentId, tournamentId),
          eq(participants.isBye, false),
        ),
      );
  },

  /**
   * Obtiene registros pendientes de sincronización.
   */
  getPendingSync: async (): Promise<Participant[]> => {
    const db = getLocalDb();
    if (!db) return [];

    return db
      .select()
      .from(participants)
      .where(eq(participants.syncStatus, SyncStatus.PENDING));
  },

  /**
   * Actualiza el seed de un participante.
   */
  updateSeed: async (id: string, seed: number): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    const now = new Date().toISOString();
    await db
      .update(participants)
      .set({
        seed,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(participants.id, id));
  },

  /**
   * Vincula un usuario registrado a un participante casual.
   * Solo permitido si el torneo sigue en estado 'draft'.
   */
  linkUser: async (participantId: string, userId: string): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    const now = new Date().toISOString();
    await db
      .update(participants)
      .set({
        linkedUserId: userId,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(participants.id, participantId));
  },

  /**
   * Busca un participante por email en un torneo.
   * Usado para el flujo de reclamacion (claim).
   */
  getByEmailAndTournament: async (
    email: string,
    tournamentId: string,
  ): Promise<Participant | undefined> => {
    const db = getLocalDb();
    if (!db) return undefined;

    const results = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.email, email),
          eq(participants.tournamentId, tournamentId),
        ),
      )
      .limit(1);
    return results[0];
  },

  /**
   * Marca registros como sincronizados.
   */
  markSynced: async (ids: string[]): Promise<void> => {
    const db = getLocalDb();
    if (!db) return;

    const now = new Date().toISOString();
    for (const id of ids) {
      await db
        .update(participants)
        .set({
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: now,
        })
        .where(eq(participants.id, id));
    }
  },

  /**
   * Upsert desde datos remotos (pull).
   */
  upsertFromRemote: async (remoteParticipants: Participant[]): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    for (const p of remoteParticipants) {
      const existing = await ParticipantRepository.getById(p.id);
      if (existing) {
        if (p.updatedAt > existing.updatedAt) {
          await db
            .update(participants)
            .set({
              ...p,
              syncStatus: SyncStatus.SYNCED,
              lastSyncedAt: new Date().toISOString(),
            })
            .where(eq(participants.id, p.id));
        }
      } else {
        await db.insert(participants).values({
          ...p,
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
  },

  /**
   * Elimina un participante.
   */
  delete: async (id: string): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    await db.delete(participants).where(eq(participants.id, id));
  },
};