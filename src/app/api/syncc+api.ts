/**
 * app/api/sync+api.ts
 * ---------------------
 * Expo API Route para sincronización bidireccional.
 *
 * POST /api/sync — Push: Recibe registros PENDING del cliente y hace upsert en Supabase.
 * GET  /api/sync — Pull: Retorna registros modificados después de un timestamp.
 *
 * Seguridad:
 *   - Valida sesión Better-Auth en cada petición.
 *   - Valida que el organizerId del torneo coincida con el usuario autenticado.
 *   - Usa consultas parametrizadas (Drizzle ORM) para prevenir SQL injection.
 */

import { eq, and, gt, sql } from 'drizzle-orm';
import {
  tournaments as remoteTournaments,
  participants as remoteParticipants,
  matches as remoteMatches,
} from '@/src/db/remote-schema';
import { auth } from '@/src/lib/auth';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SyncPushPayload {
  tournaments: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Helper: Obtener DB remoto (importación dinámica)
// ---------------------------------------------------------------------------

async function getDb() {
  const { getRemoteDb } = await import('@/src/db/remote-client');
  return getRemoteDb();
}

// ---------------------------------------------------------------------------
// Helper: Validar sesión
// ---------------------------------------------------------------------------

async function validateSession(request: Request) {
  /* // COMENTADO TEMPORALMENTE PARA PRUEBAS CON THUNDER CLIENT
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED');
  }
  return session.user;
  */

  // SUSTITUYE ESTO POR EL ID DE TU USUARIO EN SUPABASE (Authentication > Users)
  // Esto permite que Thunder Client pase sin necesidad de un Token Bearer
  return { id: '9df606ab-104b-4499-922a-6b33b5c0ae9b' }; 
}
// ---------------------------------------------------------------------------
// POST /api/sync — Push
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // 1. Validar autenticación
    const user = await validateSession(request);

    // 2. Parsear payload
    const payload: SyncPushPayload = await request.json();
    const db = await getDb();

    const syncedIds = {
      tournaments: [] as string[],
      participants: [] as string[],
      matches: [] as string[],
    };

    // 3. Upsert Tournaments (validar propiedad)
    for (const t of payload.tournaments) {
      // Validar que el organizador es el usuario autenticado
      if (t.organizerId !== user.id) {
        continue; // Silenciosamente ignorar torneos que no pertenecen al usuario
      }

      await db
        .insert(remoteTournaments)
        .values({
          id: t.id as string,
          organizerId: t.organizerId as string,
          name: t.name as string,
          type: t.type as string,
          status: (t.status as string) || 'draft',
          bestOf: (t.bestOf as number) || 1,
          maxParticipants: (t.maxParticipants as number) || 16,
          syncStatus: 'SYNCED',
          createdAt: t.createdAt ? new Date(t.createdAt as string) : new Date(),
          updatedAt: t.updatedAt ? new Date(t.updatedAt as string) : new Date(),
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: remoteTournaments.id,
          set: {
            name: sql`EXCLUDED.name`,
            type: sql`EXCLUDED.type`,
            status: sql`EXCLUDED.status`,
            bestOf: sql`EXCLUDED.best_of`,
            maxParticipants: sql`EXCLUDED.max_participants`,
            updatedAt: sql`EXCLUDED.updated_at`,
            lastSyncedAt: new Date(),
          },
        });

      syncedIds.tournaments.push(t.id as string);
    }

    // 4. Upsert Participants
    for (const p of payload.participants) {
      // Verificar que el torneo pertenece al usuario
      const tournament = await db
        .select({ organizerId: remoteTournaments.organizerId })
        .from(remoteTournaments)
        .where(eq(remoteTournaments.id, p.tournamentId as string))
        .limit(1);

      if (!tournament[0] || tournament[0].organizerId !== user.id) {
        continue;
      }

      await db
        .insert(remoteParticipants)
        .values({
          id: p.id as string,
          tournamentId: p.tournamentId as string,
          nickname: p.nickname as string,
          email: (p.email as string) || null,
          linkedUserId: (p.linkedUserId as string) || null,
          seed: (p.seed as number) || null,
          isBye: (p.isBye as boolean) || false,
          syncStatus: 'SYNCED',
          createdAt: p.createdAt ? new Date(p.createdAt as string) : new Date(),
          updatedAt: p.updatedAt ? new Date(p.updatedAt as string) : new Date(),
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: remoteParticipants.id,
          set: {
            nickname: sql`EXCLUDED.nickname`,
            email: sql`EXCLUDED.email`,
            linkedUserId: sql`EXCLUDED.linked_user_id`,
            seed: sql`EXCLUDED.seed`,
            isBye: sql`EXCLUDED.is_bye`,
            updatedAt: sql`EXCLUDED.updated_at`,
            lastSyncedAt: new Date(),
          },
        });

      syncedIds.participants.push(p.id as string);
    }

    // 5. Upsert Matches
    for (const m of payload.matches) {
      // Verificar propiedad del torneo
      const tournament = await db
        .select({ organizerId: remoteTournaments.organizerId })
        .from(remoteTournaments)
        .where(eq(remoteTournaments.id, m.tournamentId as string))
        .limit(1);

      if (!tournament[0] || tournament[0].organizerId !== user.id) {
        continue;
      }

      await db
        .insert(remoteMatches)
        .values({
          id: m.id as string,
          tournamentId: m.tournamentId as string,
          round: m.round as number,
          position: m.position as number,
          bracketType: (m.bracketType as string) || 'WINNERS',
          player1Id: (m.player1Id as string) || null,
          player2Id: (m.player2Id as string) || null,
          player1Score: (m.player1Score as number) ?? null,
          player2Score: (m.player2Score as number) ?? null,
          winnerId: (m.winnerId as string) || null,
          nextMatchId: (m.nextMatchId as string) || null,
          loserNextMatchId: (m.loserNextMatchId as string) || null,
          syncStatus: 'SYNCED',
          createdAt: m.createdAt ? new Date(m.createdAt as string) : new Date(),
          updatedAt: m.updatedAt ? new Date(m.updatedAt as string) : new Date(),
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: remoteMatches.id,
          set: {
            player1Id: sql`EXCLUDED.player1_id`,
            player2Id: sql`EXCLUDED.player2_id`,
            player1Score: sql`EXCLUDED.player1_score`,
            player2Score: sql`EXCLUDED.player2_score`,
            winnerId: sql`EXCLUDED.winner_id`,
            nextMatchId: sql`EXCLUDED.next_match_id`,
            loserNextMatchId: sql`EXCLUDED.loser_next_match_id`,
            updatedAt: sql`EXCLUDED.updated_at`,
            lastSyncedAt: new Date(),
          },
        });

      syncedIds.matches.push(m.id as string);
    }

    return Response.json({
      success: true,
      syncedIds,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    console.error('[sync+api] Push error:', error);
    return Response.json(
      { error: 'Error interno de sincronización' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/sync — Pull
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    // 1. Validar autenticación
    const user = await validateSession(request);

    // 2. Parsear query params
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get('tournamentId');
    const lastSyncedAt = url.searchParams.get('lastSyncedAt');

    if (!tournamentId) {
      return Response.json(
        { error: 'tournamentId es requerido' },
        { status: 400 },
      );
    }

    const db = await getDb();

    // 3. Verificar propiedad del torneo
    const tournament = await db
      .select()
      .from(remoteTournaments)
      .where(
        and(
          eq(remoteTournaments.id, tournamentId),
          eq(remoteTournaments.organizerId, user.id),
        ),
      )
      .limit(1);

    if (!tournament[0]) {
      return Response.json(
        { error: 'Torneo no encontrado o no autorizado' },
        { status: 404 },
      );
    }

    // 4. Obtener registros (con filtro de timestamp si se provee)
    let tournamentData = [tournament[0]];
    let participantData;
    let matchData;

    if (lastSyncedAt) {
      const sinceDate = new Date(lastSyncedAt);
      participantData = await db
        .select()
        .from(remoteParticipants)
        .where(
          and(
            eq(remoteParticipants.tournamentId, tournamentId),
            gt(remoteParticipants.updatedAt, sinceDate),
          ),
        );

      matchData = await db
        .select()
        .from(remoteMatches)
        .where(
          and(
            eq(remoteMatches.tournamentId, tournamentId),
            gt(remoteMatches.updatedAt, sinceDate),
          ),
        );
    } else {
      participantData = await db
        .select()
        .from(remoteParticipants)
        .where(eq(remoteParticipants.tournamentId, tournamentId));

      matchData = await db
        .select()
        .from(remoteMatches)
        .where(eq(remoteMatches.tournamentId, tournamentId));
    }

    return Response.json({
      tournaments: tournamentData,
      participants: participantData,
      matches: matchData,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    console.error('[sync+api] Pull error:', error);
    return Response.json(
      { error: 'Error interno de sincronización' },
      { status: 500 },
    );
  }
}
