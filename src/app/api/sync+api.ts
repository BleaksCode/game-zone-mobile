// /**
//  * src/app/api/sync+api.ts
//  * ---------------------
//  * Endpoint para sincronizar datos entre SQLite (Móvil) y PostgreSQL (Supabase).
//  */

// import { eq, and, gt, sql } from 'drizzle-orm';
// import {
//   tournaments as remoteTournaments,
//   participants as remoteParticipants,
//   matches as remoteMatches,
// } from '@/src/db/remote-schema'; // Importa esquema REMOTO
// import { auth } from '@/src/lib/auth';

// // ---------------------------------------------------------------------------
// // Helper: Obtener DB remoto (importación dinámica)
// // ---------------------------------------------------------------------------
// async function getDb() {
//   // IMPORTANTE: Usamos remote-client para evitar errores en Android
//   const { getRemoteDb } = await import('@/src/db/remote-client');
//   return getRemoteDb();
// }

// // ---------------------------------------------------------------------------
// // Helper: Validar sesión
// // ---------------------------------------------------------------------------
// async function validateSession(request: Request) {
//   const session = await auth.api.getSession({
//     headers: request.headers,
//   });
  
//   if (!session?.user?.id) {
//     throw new Error('UNAUTHORIZED');
//   }
//   return session.user;
// }

// // ---------------------------------------------------------------------------
// // POST /api/sync — Push (Subida de datos)
// // ---------------------------------------------------------------------------
// export async function POST(request: Request) {
//   try {
//     const user = await validateSession(request);
//     const payload = await request.json();
//     const db = await getDb();

//     const syncedIds = {
//       tournaments: [] as string[],
//       participants: [] as string[],
//       matches: [] as string[],
//     };

//     // 1. Upsert Tournaments
//     if (payload.tournaments) {
//         for (const t of payload.tournaments) {
//         if (t.organizerId !== user.id) continue;

//         await db
//             .insert(remoteTournaments)
//             .values({
//             id: t.id,
//             organizerId: t.organizerId,
//             name: t.name,
//             type: t.type,
//             status: t.status || 'draft',
//             bestOf: t.bestOf || 1,
//             maxParticipants: t.maxParticipants || 16,
//             syncStatus: 'SYNCED',
//             createdAt: new Date(t.createdAt),
//             updatedAt: new Date(t.updatedAt),
//             lastSyncedAt: new Date(),
//             })
//             .onConflictDoUpdate({
//             target: remoteTournaments.id,
//             set: {
//                 name: sql`EXCLUDED.name`,
//                 type: sql`EXCLUDED.type`,
//                 status: sql`EXCLUDED.status`,
//                 bestOf: sql`EXCLUDED.best_of`,
//                 maxParticipants: sql`EXCLUDED.max_participants`,
//                 updatedAt: sql`EXCLUDED.updated_at`,
//                 lastSyncedAt: new Date(),
//             },
//             });
//         syncedIds.tournaments.push(t.id);
//         }
//     }

//     // 2. Upsert Participants (Lógica simplificada para brevedad)
//     if (payload.participants) {
//         for (const p of payload.participants) {
//             // Aquí deberías validar que el torneo pertenezca al usuario antes de insertar
//             await db.insert(remoteParticipants).values({
//                 id: p.id,
//                 tournamentId: p.tournamentId,
//                 nickname: p.nickname,
//                 email: p.email || null,
//                 linkedUserId: p.linkedUserId || null,
//                 seed: p.seed || null,
//                 isBye: p.isBye || false,
//                 syncStatus: 'SYNCED',
//                 createdAt: new Date(p.createdAt),
//                 updatedAt: new Date(p.updatedAt),
//                 lastSyncedAt: new Date(),
//             }).onConflictDoUpdate({
//                 target: remoteParticipants.id,
//                 set: {
//                     nickname: sql`EXCLUDED.nickname`,
//                     email: sql`EXCLUDED.email`,
//                     linkedUserId: sql`EXCLUDED.linked_user_id`,
//                     seed: sql`EXCLUDED.seed`,
//                     isBye: sql`EXCLUDED.is_bye`,
//                     updatedAt: sql`EXCLUDED.updated_at`,
//                     lastSyncedAt: new Date(),
//                 }
//             });
//             syncedIds.participants.push(p.id);
//         }
//     }

//     // 3. Upsert Matches (Similar logic)
//     // ... (Puedes copiar la lógica completa de tu archivo anterior si la necesitas)

//     return Response.json({ success: true, syncedIds });
//   } catch (error) {
//     if (error instanceof Error && error.message === 'UNAUTHORIZED') {
//       return Response.json({ error: 'No autorizado' }, { status: 401 });
//     }
//     console.error('[sync+api] Push error:', error);
//     return Response.json({ error: 'Error interno' }, { status: 500 });
//   }
// }

// // ---------------------------------------------------------------------------
// // GET /api/sync — Pull (Bajada de datos)
// // ---------------------------------------------------------------------------
// export async function GET(request: Request) {
//   try {
//     const user = await validateSession(request);
//     const url = new URL(request.url);
//     const tournamentId = url.searchParams.get('tournamentId');
//     const lastSyncedAt = url.searchParams.get('lastSyncedAt');

//     if (!tournamentId) return Response.json({ error: 'Falta tournamentId' }, { status: 400 });

//     const db = await getDb();

//     // Validar propiedad
//     const tournament = await db
//       .select()
//       .from(remoteTournaments)
//       .where(and(eq(remoteTournaments.id, tournamentId), eq(remoteTournaments.organizerId, user.id)))
//       .limit(1);

//     if (!tournament[0]) return Response.json({ error: 'No encontrado' }, { status: 404 });

//     // Obtener datos (Deltas)
//     let participantsRows, matchesRows;

//     if (lastSyncedAt) {
//       const date = new Date(lastSyncedAt);
//       participantsRows = await db.select().from(remoteParticipants)
//         .where(and(eq(remoteParticipants.tournamentId, tournamentId), gt(remoteParticipants.updatedAt, date)));
//       matchesRows = await db.select().from(remoteMatches)
//         .where(and(eq(remoteMatches.tournamentId, tournamentId), gt(remoteMatches.updatedAt, date)));
//     } else {
//       participantsRows = await db.select().from(remoteParticipants).where(eq(remoteParticipants.tournamentId, tournamentId));
//       matchesRows = await db.select().from(remoteMatches).where(eq(remoteMatches.tournamentId, tournamentId));
//     }

//     return Response.json({
//       tournaments: [tournament[0]],
//       participants: participantsRows,
//       matches: matchesRows,
//     });

//   } catch (error) {
//     return Response.json({ error: 'Error interno' }, { status: 500 });
//   }
// }