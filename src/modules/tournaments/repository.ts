/**
 * modules/tournaments/repository.ts
 * -----------------------------------
 * Capa de acceso a datos para la tabla `tournaments`.
 * Opera contra SQLite local vía Drizzle ORM.
 */

import { eq } from 'drizzle-orm';
import { getLocalDb } from '@/db/client'; // <--- CAMBIO: Usar getter seguro
import {
  tournaments,
  SyncStatus,
  type Tournament,
  type NewTournament,
  type TournamentStatusType,
} from '@/db/schema';
import * as Crypto from 'expo-crypto';

export const TournamentRepository = {
  /**
   * Crea un nuevo torneo en SQLite local.
   */
  create: async (data: Omit<NewTournament, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Tournament> => {
    const db = getLocalDb(); // <--- OBTENER DB
    if (!db) throw new Error('Base de datos local no disponible');

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    const newTournament: NewTournament = {
      ...data,
      id,
      syncStatus: SyncStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tournaments).values(newTournament);
    return TournamentRepository.getById(id) as Promise<Tournament>;
  },

  /**
   * Obtiene un torneo por su ID.
   */
  getById: async (id: string): Promise<Tournament | undefined> => {
    const db = getLocalDb();
    if (!db) return undefined; // Fail-safe para servidor

    const results = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id))
      .limit(1);
    return results[0];
  },

  /**
   * Obtiene todos los torneos de un organizador.
   */
  getByOrganizerId: async (organizerId: string): Promise<Tournament[]> => {
    const db = getLocalDb();
    if (!db) return [];

    return db
      .select()
      .from(tournaments)
      .where(eq(tournaments.organizerId, organizerId));
  },

  /**
   * Obtiene todos los registros pendientes de sincronización.
   */
  getPendingSync: async (): Promise<Tournament[]> => {
    const db = getLocalDb();
    if (!db) return [];

    return db
      .select()
      .from(tournaments)
      .where(eq(tournaments.syncStatus, SyncStatus.PENDING));
  },

  /**
   * Actualiza el estado del torneo.
   */
  updateStatus: async (id: string, status: TournamentStatusType): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    const now = new Date().toISOString();
    await db
      .update(tournaments)
      .set({
        status,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(tournaments.id, id));
  },

  /**
   * Actualiza campos arbitrarios de un torneo.
   */
  update: async (id: string, data: Partial<Omit<NewTournament, 'id'>>): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    const now = new Date().toISOString();
    await db
      .update(tournaments)
      .set({
        ...data,
        updatedAt: now,
        syncStatus: SyncStatus.PENDING,
      })
      .where(eq(tournaments.id, id));
  },

  /**
   * Marca registros como sincronizados después de un push exitoso.
   */
  markSynced: async (ids: string[]): Promise<void> => {
    const db = getLocalDb();
    if (!db) return;

    const now = new Date().toISOString();
    for (const id of ids) {
      await db
        .update(tournaments)
        .set({
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: now,
        })
        .where(eq(tournaments.id, id));
    }
  },

  /**
   * Upsert de torneos recibidos desde la nube (pull).
   */
  upsertFromRemote: async (remoteTournaments: Tournament[]): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    for (const t of remoteTournaments) {
      const existing = await TournamentRepository.getById(t.id);
      if (existing) {
        // Solo actualizamos si el remoto es más reciente
        if (t.updatedAt > existing.updatedAt) {
          await db
            .update(tournaments)
            .set({
              ...t,
              syncStatus: SyncStatus.SYNCED,
              lastSyncedAt: new Date().toISOString(),
            })
            .where(eq(tournaments.id, t.id));
        }
      } else {
        await db.insert(tournaments).values({
          ...t,
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
  },

  /**
   * Elimina un torneo localmente.
   */
  delete: async (id: string): Promise<void> => {
    const db = getLocalDb();
    if (!db) throw new Error('Base de datos local no disponible');

    await db.delete(tournaments).where(eq(tournaments.id, id));
  },
};