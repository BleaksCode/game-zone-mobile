/**
 * lib/sync-engine.ts
 * --------------------
 * Motor de sincronización Local-first.
 * Detecta registros con SyncStatus.PENDING y los envía al servidor
 * vía HTTP (push). También soporta pull para obtener actualizaciones.
 *
 * Diseñado para ejecutarse en el cliente (React Native).
 * NO usa WebSockets: la sincronización es unidireccional push/pull.
 */

import { TournamentRepository } from '@/modules/tournaments/repository';
import { ParticipantRepository } from '@/modules/participants/repository';
import { MatchRepository } from '@/modules/matches/repository';
import type { Tournament, Participant, Match } from '@/db/schema';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface SyncPushPayload {
  tournaments: Tournament[];
  participants: Participant[];
  matches: Match[];
}

interface SyncPushResponse {
  success: boolean;
  syncedIds: {
    tournaments: string[];
    participants: string[];
    matches: string[];
  };
  errors?: string[];
}

interface SyncPullParams {
  tournamentId: string;
  lastSyncedAt?: string;
}

interface SyncPullResponse {
  tournaments: Tournament[];
  participants: Participant[];
  matches: Match[];
}

interface SyncEngineConfig {
  /** URL base del servidor API (Expo API Routes). */
  apiBaseUrl: string;
  /** Token de sesión Better-Auth para autenticación. */
  getSessionToken: () => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Sync Engine
// ---------------------------------------------------------------------------

export function createSyncEngine(config: SyncEngineConfig) {
  const { apiBaseUrl, getSessionToken } = config;

  /**
   * Construye headers de autenticación.
   */
  async function getAuthHeaders(): Promise<Record<string, string>> {
    const token = await getSessionToken();
    if (!token) {
      throw new Error('No hay sesión activa. Inicia sesión para sincronizar.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  return {
    // =====================================================================
    // PUSH: Enviar cambios locales al servidor
    // =====================================================================

    /**
     * Detecta todos los registros PENDING y los envía al endpoint /api/sync.
     * Al recibir confirmación, los marca como SYNCED.
     */
    push: async (): Promise<SyncPushResponse> => {
      // 1. Recopilar registros pendientes
      const [pendingTournaments, pendingParticipants, pendingMatches] =
        await Promise.all([
          TournamentRepository.getPendingSync(),
          ParticipantRepository.getPendingSync(),
          MatchRepository.getPendingSync(),
        ]);

      // Si no hay nada pendiente, salir temprano
      if (
        pendingTournaments.length === 0 &&
        pendingParticipants.length === 0 &&
        pendingMatches.length === 0
      ) {
        return {
          success: true,
          syncedIds: { tournaments: [], participants: [], matches: [] },
        };
      }

      // 2. Enviar al servidor
      const headers = await getAuthHeaders();
      const payload: SyncPushPayload = {
        tournaments: pendingTournaments,
        participants: pendingParticipants,
        matches: pendingMatches,
      };

      const response = await fetch(`${apiBaseUrl}/api/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Sync push failed: ${response.status} - ${JSON.stringify(errorData)}`,
        );
      }

      const result: SyncPushResponse = await response.json();

      // 3. Marcar registros como sincronizados
      if (result.success) {
        await Promise.all([
          TournamentRepository.markSynced(result.syncedIds.tournaments),
          ParticipantRepository.markSynced(result.syncedIds.participants),
          MatchRepository.markSynced(result.syncedIds.matches),
        ]);
      }

      return result;
    },

    // =====================================================================
    // PULL: Obtener actualizaciones del servidor
    // =====================================================================

    /**
     * Obtiene registros modificados desde el servidor.
     * Se usa para refresh manual o periódico.
     */
    pull: async (params: SyncPullParams): Promise<SyncPullResponse> => {
      const headers = await getAuthHeaders();

      const queryParams = new URLSearchParams({
        tournamentId: params.tournamentId,
      });
      if (params.lastSyncedAt) {
        queryParams.set('lastSyncedAt', params.lastSyncedAt);
      }

      const response = await fetch(
        `${apiBaseUrl}/api/sync?${queryParams.toString()}`,
        {
          method: 'GET',
          headers,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Sync pull failed: ${response.status} - ${JSON.stringify(errorData)}`,
        );
      }

      const data: SyncPullResponse = await response.json();

      // Upsert datos remotos en SQLite local
      await Promise.all([
        TournamentRepository.upsertFromRemote(data.tournaments),
        ParticipantRepository.upsertFromRemote(data.participants),
        MatchRepository.upsertFromRemote(data.matches),
      ]);

      return data;
    },

    // =====================================================================
    // AUTO-SYNC: Sincronización periódica
    // =====================================================================

    /**
     * Inicia un ciclo de sincronización push periódico.
     * Retorna una función para detener el ciclo.
     */
    startAutoSync: (intervalMs: number = 30000): (() => void) => {
      const syncEngine = createSyncEngine(config);
      let isRunning = true;

      const run = async () => {
        while (isRunning) {
          try {
            await syncEngine.push();
          } catch (error) {
            // Silenciar errores de red (estamos offline)
            if (error instanceof TypeError && error.message.includes('fetch')) {
              // Network error — silently retry
            } else {
              console.warn('[SyncEngine] Push error:', error);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      };

      run();

      return () => {
        isRunning = false;
      };
    },

    /**
     * Verifica si hay registros pendientes de sincronización.
     */
    hasPendingChanges: async (): Promise<boolean> => {
      const [t, p, m] = await Promise.all([
        TournamentRepository.getPendingSync(),
        ParticipantRepository.getPendingSync(),
        MatchRepository.getPendingSync(),
      ]);
      return t.length > 0 || p.length > 0 || m.length > 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Exportación de tipo para uso en componentes
// ---------------------------------------------------------------------------

export type SyncEngine = ReturnType<typeof createSyncEngine>;
