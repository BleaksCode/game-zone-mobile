/**
 * modules/tournaments/TournamentLogicService.ts
 * -----------------------------------------------
 * Motor de lógica competitiva para generación de brackets,
 * seeding profesional, manejo recursivo de BYEs, y reporte de scores.
 *
 * Soporta:
 * - Single Elimination
 * - Double Elimination (con cross-bracketing y Bracket Reset)
 * - Seeding recursivo N+1 (1vs16, 8vs9, 4vs13, etc.)
 * - Auto-procesamiento de BYEs en cadena
 * - Best-of validation (Bo1, Bo3, Bo5)
 *
 * Integrado con Drizzle ORM + SQLite local. Cada escritura marca
 * SyncStatus.PENDING para posterior sincronización HTTP.
 */

import { eq } from 'drizzle-orm';
import { getLocalDb } from '@/db/client'; // <--- CAMBIO AQUÍ
import {
  matches,
  SyncStatus,
  BracketType,
  TournamentStatus,
  type Match,
  type Participant,
  type NewMatch,
} from '@/db/schema';
import { MatchRepository } from '@/modules/matches/repository';
import { TournamentRepository } from '@/modules/tournaments/repository';
import { ParticipantRepository } from '@/modules/participants/repository';
import * as Crypto from 'expo-crypto';

// ---------------------------------------------------------------------------
// Interfaces internas
// ---------------------------------------------------------------------------

interface SeedParticipant {
  id: string;
  nickname: string;
  seed: number;
  isBye: boolean;
}

interface GeneratedMatch {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  bracketType: string;
  player1Id: string | null;
  player2Id: string | null;
  player1Score: number | null;
  player2Score: number | null;
  winnerId: string | null;
  nextMatchId: string | null;
  loserNextMatchId: string | null;
}

// ---------------------------------------------------------------------------
// Servicio Principal
// ---------------------------------------------------------------------------

export const TournamentLogicService = {
  // =========================================================================
  // ENTRY POINT: Iniciar torneo
  // =========================================================================

  /**
   * Genera los brackets e inicia el torneo.
   * 1. Obtiene torneo y participantes.
   * 2. Normaliza a potencia de 2 (con BYEs).
   * 3. Genera Single o Double Elimination.
   * 4. Guarda matches en SQLite.
   * 5. Auto-procesa cadena de BYEs.
   * 6. Marca torneo como 'active'.
   */
  startTournament: async (tournamentId: string): Promise<GeneratedMatch[]> => {
    const tournament = await TournamentRepository.getById(tournamentId);
    if (!tournament) throw new Error('Torneo no encontrado');
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new Error('El torneo debe estar en estado draft para iniciarse');
    }

    const participantsData = await ParticipantRepository.getRealByTournamentId(tournamentId);
    if (participantsData.length < 2) {
      throw new Error('Se necesitan al menos 2 participantes reales');
    }

    // Normalizar (seeds + BYEs)
    const normalizedParticipants = TournamentLogicService.normalizeParticipants(participantsData);

    // Generar bracket
    const tType = tournament.type?.trim().toLowerCase();
    let generatedMatches: GeneratedMatch[];

    if (tType === 'double_elimination') {
      generatedMatches = TournamentLogicService.generateDoubleElimination(
        tournamentId,
        normalizedParticipants,
      );
    } else {
      generatedMatches = TournamentLogicService.generateSingleElimination(
        tournamentId,
        normalizedParticipants,
      );
    }

    // Persistir en SQLite
    await MatchRepository.createMany(
      generatedMatches.map((m) => ({
        id: m.id,
        tournamentId: m.tournamentId,
        round: m.round,
        position: m.position,
        bracketType: m.bracketType,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        player1Score: m.player1Score,
        player2Score: m.player2Score,
        winnerId: m.winnerId,
        nextMatchId: m.nextMatchId,
        loserNextMatchId: m.loserNextMatchId,
      })),
    );

    // Auto-procesar BYEs en cascada
    await TournamentLogicService.autoProcessByes(tournamentId);

    // Activar torneo
    await TournamentRepository.updateStatus(tournamentId, TournamentStatus.ACTIVE);

    return generatedMatches;
  },

  // =========================================================================
  // SEEDING: Algoritmo recursivo N+1
  // =========================================================================

  /**
   * Genera el orden de seeds para N participantes.
   * Para 8 jugadores: [1, 8, 4, 5, 2, 7, 3, 6]
   * Garantiza que Seed#1 y Seed#2 no se crucen hasta la final.
   */
  getSeedOrder: (count: number): number[] => {
    if (count === 2) return [1, 2];
    const previous = TournamentLogicService.getSeedOrder(count / 2);
    const current: number[] = [];
    for (const seed of previous) {
      current.push(seed);
      current.push(count + 1 - seed);
    }
    return current;
  },

  // =========================================================================
  // NORMALIZACIÓN: Potencia de 2 + BYEs
  // =========================================================================

  /**
   * Asegura que el listado tenga potencia-de-2 participantes.
   * Si no hay seeds previos, los asigna aleatoriamente (Fisher-Yates).
   * Los mejores seeds (numeros bajos) reciben BYEs.
   */
  normalizeParticipants: (participantsRaw: Participant[]): SeedParticipant[] => {
    const n = participantsRaw.length;
    const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(n)));

    let pool = [...participantsRaw];
    const hasSeeds = participantsRaw.some((p) => p.seed && p.seed > 0);

    if (!hasSeeds) {
      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    } else {
      pool.sort((a, b) => (a.seed || 999) - (b.seed || 999));
    }

    const result: SeedParticipant[] = pool.map((p, i) => ({
      id: p.id,
      nickname: p.nickname,
      seed: i + 1,
      isBye: false,
    }));

    // Completar con BYEs
    for (let i = n + 1; i <= nextPowerOfTwo; i++) {
      result.push({
        id: `BYE-${Crypto.randomUUID()}`,
        nickname: 'BYE',
        seed: i,
        isBye: true,
      });
    }

    return result;
  },

  // =========================================================================
  // SINGLE ELIMINATION
  // =========================================================================

  generateSingleElimination: (
    tournamentId: string,
    seedParticipants: SeedParticipant[],
  ): GeneratedMatch[] => {
    const n = seedParticipants.length;
    const totalRounds = Math.log2(n);
    const result: GeneratedMatch[] = [];
    const seedOrder = TournamentLogicService.getSeedOrder(n);
    const pMap = new Map(seedParticipants.map((p) => [p.seed, p]));

    // Pre-generar IDs para poder referenciarlos
    const matchIdMap = new Map<string, string>();
    for (let r = 1; r <= totalRounds; r++) {
      const matchesInRound = n / Math.pow(2, r);
      for (let p = 1; p <= matchesInRound; p++) {
        matchIdMap.set(`W-${r}-${p}`, Crypto.randomUUID());
      }
    }

    for (let r = 1; r <= totalRounds; r++) {
      const matchesInRound = n / Math.pow(2, r);
      for (let p = 1; p <= matchesInRound; p++) {
        const id = matchIdMap.get(`W-${r}-${p}`)!;
        const nextMatchId = matchIdMap.get(`W-${r + 1}-${Math.ceil(p / 2)}`) || null;

        // Solo la ronda 1 tiene jugadores pre-asignados
        let p1: SeedParticipant | undefined;
        let p2: SeedParticipant | undefined;
        if (r === 1) {
          p1 = pMap.get(seedOrder[(p - 1) * 2]);
          p2 = pMap.get(seedOrder[(p - 1) * 2 + 1]);
        }

        const player1Id = p1 ? (p1.isBye ? null : p1.id) : null;
        const player2Id = p2 ? (p2.isBye ? null : p2.id) : null;

        result.push({
          id,
          tournamentId,
          round: r,
          position: p,
          bracketType: BracketType.WINNERS,
          player1Id,
          player2Id,
          player1Score: null,
          player2Score: null,
          winnerId: null,
          nextMatchId,
          loserNextMatchId: null,
        });
      }
    }

    return result;
  },

  // =========================================================================
  // DOUBLE ELIMINATION
  // =========================================================================

  generateDoubleElimination: (
    tournamentId: string,
    seedParticipants: SeedParticipant[],
  ): GeneratedMatch[] => {
    const n = seedParticipants.length;
    const wbTotalRounds = Math.log2(n);
    const totalLBRounds = (wbTotalRounds - 1) * 2;

    // --- Pre-generar IDs Winners Bracket ---
    const wbIdMap = new Map<string, string>();
    for (let r = 1; r <= wbTotalRounds; r++) {
      const matchesInRound = n / Math.pow(2, r);
      for (let p = 1; p <= matchesInRound; p++) {
        wbIdMap.set(`W-${r}-${p}`, Crypto.randomUUID());
      }
    }

    // --- Pre-generar IDs Losers Bracket ---
    const lbIdMap = new Map<string, string>();
    for (let r = 1; r <= totalLBRounds; r++) {
      const matchesInRound = TournamentLogicService.getLBMatchCount(r, totalLBRounds, n);
      for (let p = 1; p <= matchesInRound; p++) {
        lbIdMap.set(`L-${r}-${p}`, Crypto.randomUUID());
      }
    }

    const gfId = Crypto.randomUUID();
    const gfResetId = Crypto.randomUUID();

    // --- Generar Winners Bracket ---
    const wbMatches = TournamentLogicService.generateSingleElimination(
      tournamentId,
      seedParticipants,
    );

    // Reasignar IDs generados y enlazar con Losers Bracket
    for (const m of wbMatches) {
      const key = `W-${m.round}-${m.position}`;
      const newId = wbIdMap.get(key)!;

      // Actualizar referencias en otros matches
      for (const other of wbMatches) {
        if (other.nextMatchId === m.id) other.nextMatchId = newId;
      }
      m.id = newId;

      // Enlazar Winners Final -> Grand Final
      if (m.round === wbTotalRounds) {
        m.nextMatchId = gfId;
        // Perdedor de WB Final cae a LB Final
        m.loserNextMatchId = lbIdMap.get(`L-${totalLBRounds}-1`) || null;
      } else {
        // Enlazar perdedores a Losers Bracket
        m.loserNextMatchId = TournamentLogicService.calculateLoserDropTarget(
          m.round,
          m.position,
          n,
          lbIdMap,
        );
        // Actualizar nextMatchId con nuevo ID
        const nextKey = `W-${m.round + 1}-${Math.ceil(m.position / 2)}`;
        m.nextMatchId = wbIdMap.get(nextKey) || null;
      }
    }

    // --- Generar Losers Bracket ---
    const lbMatches: GeneratedMatch[] = [];
    for (let r = 1; r <= totalLBRounds; r++) {
      const matchesInRound = TournamentLogicService.getLBMatchCount(r, totalLBRounds, n);
      const isMajorRound = r % 2 === 0;

      for (let p = 1; p <= matchesInRound; p++) {
        const id = lbIdMap.get(`L-${r}-${p}`)!;

        let nextMatchId: string | null;
        if (r === totalLBRounds) {
          nextMatchId = gfId; // Ganador de LB Final va a Grand Final
        } else if (isMajorRound) {
          // Major round: reduce 2 a 1
          nextMatchId = lbIdMap.get(`L-${r + 1}-${Math.ceil(p / 2)}`) || null;
        } else {
          // Minor round: misma cantidad de matches
          nextMatchId = lbIdMap.get(`L-${r + 1}-${p}`) || null;
        }

        lbMatches.push({
          id,
          tournamentId,
          round: r,
          position: p,
          bracketType: BracketType.LOSERS,
          player1Id: null,
          player2Id: null,
          player1Score: null,
          player2Score: null,
          winnerId: null,
          nextMatchId,
          loserNextMatchId: null,
        });
      }
    }

    // --- Grand Final ---
    const gfMatch: GeneratedMatch = {
      id: gfId,
      tournamentId,
      round: 1,
      position: 1,
      bracketType: BracketType.GRAND_FINAL,
      player1Id: null, // Winners Champion
      player2Id: null, // Losers Champion
      player1Score: null,
      player2Score: null,
      winnerId: null,
      nextMatchId: gfResetId, // Potential Bracket Reset
      loserNextMatchId: null,
    };

    // --- Bracket Reset (condicional) ---
    const gfResetMatch: GeneratedMatch = {
      id: gfResetId,
      tournamentId,
      round: 2,
      position: 1,
      bracketType: BracketType.GRAND_FINAL,
      player1Id: null,
      player2Id: null,
      player1Score: null,
      player2Score: null,
      winnerId: null,
      nextMatchId: null,
      loserNextMatchId: null,
    };

    return [...wbMatches, ...lbMatches, gfMatch, gfResetMatch];
  },

  /**
   * Calcula cuántos matches tiene una ronda de Losers Bracket.
   */
  getLBMatchCount: (round: number, totalLBRounds: number, n: number): number => {
    // Rondas impares (Minor): misma cantidad que la siguiente Mayor
    // Rondas pares (Major): reduce a la mitad
    const wbRounds = Math.log2(n);
    if (round <= 0) return 0;

    // En LB, la cantidad sigue un patrón:
    // R1: n/4 matches, R2: n/4 matches, R3: n/8, R4: n/8, ...
    const pairIndex = Math.ceil(round / 2);
    return Math.max(1, Math.floor(n / Math.pow(2, pairIndex + 1)));
  },

  /**
   * Calcula a qué match de Losers cae un perdedor de Winners.
   * Aplica Cross-bracketing: Posicion_cruzada = Total - Pos + 1
   */
  calculateLoserDropTarget: (
    wbRound: number,
    wbPos: number,
    n: number,
    lbMap: Map<string, string>,
  ): string | null => {
    if (wbRound === 1) {
      // Perdedores de WBR1 se encuentran entre si en LBR1
      const lbPos = Math.ceil(wbPos / 2);
      return lbMap.get(`L-1-${lbPos}`) || null;
    }

    // Para rondas > 1: los perdedores caen a rondas pares (Major) del LB
    // con cross-bracketing
    const lbTargetRound = (wbRound - 1) * 2;
    const matchesInLBRound = TournamentLogicService.getLBMatchCount(
      lbTargetRound,
      0,
      n,
    );
    // Cross-bracketing: posicion invertida
    const crossedPos = matchesInLBRound - wbPos + 1;
    const finalPos = Math.max(1, crossedPos);
    return lbMap.get(`L-${lbTargetRound}-${finalPos}`) || null;
  },

  // =========================================================================
  // AUTO-PROCESS BYES
  // =========================================================================

  /**
   * Procesa recursivamente matches donde un jugador tiene BYE.
   * Avanza al jugador real automáticamente y propaga al siguiente match.
   * Soporta cascadas en Winners y Losers Bracket.
   */
  autoProcessByes: async (tournamentId: string): Promise<void> => {
    let changed = true;
    const processedIds = new Set<string>();

    while (changed) {
      changed = false;
      const allMatches = await MatchRepository.getByTournamentId(tournamentId);

      for (const match of allMatches) {
        if (match.winnerId || processedIds.has(match.id)) continue;

        const p1 = match.player1Id;
        const p2 = match.player2Id;

        // Buscar matches que alimentan este match
        const sourceMatches = allMatches.filter(
          (m) => m.nextMatchId === match.id || m.loserNextMatchId === match.id,
        );

        let winnerToAdvance: string | null = null;
        let isDeadMatch = false;

        const p1Sources = sourceMatches.filter((s) =>
          TournamentLogicService.isSourceForP1(s, match),
        );
        const p2Sources = sourceMatches.filter(
          (s) => !TournamentLogicService.isSourceForP1(s, match),
        );

        const p1Dead =
          p1Sources.length > 0 &&
          p1Sources.every(
            (s) =>
              (s.winnerId || processedIds.has(s.id)) &&
              !TournamentLogicService.getParticipantToSeat(s, match),
          );
        const p2Dead =
          p2Sources.length > 0 &&
          p2Sources.every(
            (s) =>
              (s.winnerId || processedIds.has(s.id)) &&
              !TournamentLogicService.getParticipantToSeat(s, match),
          );

        if (p1 && !p2) {
          if (match.round === 1 || p2Sources.length === 0 || p2Dead) {
            winnerToAdvance = p1;
          }
        } else if (!p1 && p2) {
          if (match.round === 1 || p1Sources.length === 0 || p1Dead) {
            winnerToAdvance = p2;
          }
        } else if (!p1 && !p2) {
          if (
            match.round === 1 ||
            ((p1Sources.length === 0 || p1Dead) &&
              (p2Sources.length === 0 || p2Dead))
          ) {
            isDeadMatch = true;
          }
        }

        if (winnerToAdvance || isDeadMatch) {
          processedIds.add(match.id);
          await TournamentLogicService.propagateWinner(
            match.id,
            winnerToAdvance,
            allMatches,
          );
          changed = true;
        }
      }
    }
  },

  // =========================================================================
  // PROPAGACION DE GANADOR
  // =========================================================================

  /**
   * Avanza un ganador al siguiente match y, en Double Elimination,
   * mueve al perdedor al Losers Bracket.
   */
  propagateWinner: async (
    matchId: string,
    winnerId: string | null,
    allMatches: Match[],
  ): Promise<void> => {
    const currentMatch = allMatches.find((m) => m.id === matchId);
    if (!currentMatch) return;

    // 1. Marcar ganador en el match actual
    if (winnerId) {
      await MatchRepository.setWinner(matchId, winnerId);
      currentMatch.winnerId = winnerId;
    }

    // 2. Avanzar ganador al siguiente match
    if (currentMatch.nextMatchId) {
      const nextMatch = allMatches.find((m) => m.id === currentMatch.nextMatchId);
      if (nextMatch) {
        const isP1 = TournamentLogicService.isSourceForP1(currentMatch, nextMatch);
        const seat = isP1 ? 'player1Id' : 'player2Id';
        await MatchRepository.seatPlayer(nextMatch.id, seat, winnerId);
        (nextMatch as Record<string, unknown>)[seat] = winnerId;
      }
    }

    // 3. Manejar perdedor (Double Elimination)
    if (currentMatch.loserNextMatchId) {
      const nextLoserMatch = allMatches.find(
        (m) => m.id === currentMatch.loserNextMatchId,
      );
      if (nextLoserMatch) {
        const isP1 = TournamentLogicService.isSourceForP1(currentMatch, nextLoserMatch);
        const seat = isP1 ? 'player1Id' : 'player2Id';
        const loserId = TournamentLogicService.getLoserFromMatch(currentMatch);
        await MatchRepository.seatPlayer(nextLoserMatch.id, seat, loserId);
        (nextLoserMatch as Record<string, unknown>)[seat] = loserId;
      }
    }
  },

  // =========================================================================
  // REPORT SCORE
  // =========================================================================

  /**
   * Reporta el marcador de un match.
   * Valida Bo1/Bo3/Bo5, avanza ganador, mueve perdedor al LB.
   */
  reportScore: async (
    matchId: string,
    p1Score: number,
    p2Score: number,
    bestOf?: number,
  ): Promise<string> => {
    const db = getLocalDb(); // <--- OBTENER DB
    if (!db) throw new Error('Base de datos local no disponible');

    const allMatches = await db.select().from(matches);
    const match = allMatches.find((m) => m.id === matchId);
    if (!match) throw new Error('Match no encontrado');
    if (!match.player1Id || !match.player2Id) {
      throw new Error('El match no tiene ambos jugadores asignados');
    }
    if (match.winnerId) {
      throw new Error('El match ya fue reportado');
    }

    // Validacion Best-of
    if (bestOf) {
      const winsNeeded = Math.ceil(bestOf / 2);
      if (p1Score !== winsNeeded && p2Score !== winsNeeded) {
        throw new Error(
          `En Bo${bestOf}, uno de los jugadores debe tener exactamente ${winsNeeded} victorias`,
        );
      }
      if (p1Score === winsNeeded && p2Score === winsNeeded) {
        throw new Error('Ambos jugadores no pueden ganar el mismo numero de sets');
      }
      if (p1Score > winsNeeded || p2Score > winsNeeded) {
        throw new Error(`El marcador no puede exceder ${winsNeeded} en Bo${bestOf}`);
      }
    }

    const winnerId = p1Score > p2Score ? match.player1Id : match.player2Id;
    const loserId = p1Score > p2Score ? match.player2Id : match.player1Id;

    // Actualizar score
    await MatchRepository.updateScore(matchId, p1Score, p2Score, winnerId);

    // Avanzar ganador
    if (match.nextMatchId) {
      const nextMatch = allMatches.find((m) => m.id === match.nextMatchId);
      if (nextMatch) {
        const isP1 = TournamentLogicService.isSourceForP1(match, nextMatch);
        const seat = isP1 ? 'player1Id' : 'player2Id';
        await MatchRepository.seatPlayer(nextMatch.id, seat, winnerId);
      }
    }

    // Mover perdedor al Losers Bracket
    if (match.loserNextMatchId) {
      const loserMatch = allMatches.find((m) => m.id === match.loserNextMatchId);
      if (loserMatch) {
        const isP1 = TournamentLogicService.isSourceForP1(match, loserMatch);
        const seat = isP1 ? 'player1Id' : 'player2Id';
        await MatchRepository.seatPlayer(loserMatch.id, seat, loserId);
      }
    }

    // Re-procesar BYEs por cascada
    await TournamentLogicService.autoProcessByes(match.tournamentId);

    return winnerId;
  },

  // =========================================================================
  // BRACKET RESET (Gran Final)
  // =========================================================================

  /**
   * Maneja la logica de Bracket Reset en la Gran Final.
   * Si el jugador de Losers gana la Partida A, se habilita Partida B.
   * Si el jugador de Winners gana, el torneo termina.
   */
  handleGrandFinalResult: async (
    matchId: string,
    p1Score: number,
    p2Score: number,
    bestOf?: number,
  ): Promise<{ winnerId: string; needsReset: boolean }> => {
    const allMatches = await MatchRepository.getByTournamentId('');
    const match = await MatchRepository.getById(matchId);
    if (!match) throw new Error('Match no encontrado');
    if (match.bracketType !== BracketType.GRAND_FINAL) {
      throw new Error('Este método solo aplica a la Gran Final');
    }

    const winnerId = await TournamentLogicService.reportScore(
      matchId,
      p1Score,
      p2Score,
      bestOf,
    );

    // Si gana el jugador de Losers (P2 en GF) y es la Partida A (round 1),
    // se habilita el Bracket Reset
    const isPartidaA = match.round === 1;
    const losersChampionWon = winnerId === match.player2Id;
    const needsReset = isPartidaA && losersChampionWon;

    if (needsReset && match.nextMatchId) {
      // Copiar jugadores al match de Reset
      await MatchRepository.seatPlayer(match.nextMatchId, 'player1Id', match.player1Id);
      await MatchRepository.seatPlayer(match.nextMatchId, 'player2Id', match.player2Id);
    }

    if (!needsReset) {
      // Torneo terminado: encontrar el torneo y marcarlo como completed
      const tournamentMatches = await MatchRepository.getByTournamentId(match.tournamentId);
      await TournamentRepository.updateStatus(match.tournamentId, 'completed');
    }

    return { winnerId, needsReset };
  },

  // =========================================================================
  // UTILIDADES DE SEATING
  // =========================================================================

  /**
   * Determina si un match fuente alimenta el asiento P1 del match destino.
   */
  isSourceForP1: (source: Match, target: Match): boolean => {
    const isWinnerAdvance = source.nextMatchId === target.id;
    const isLoserDrop = source.loserNextMatchId === target.id;

    if (isWinnerAdvance) {
      if (target.bracketType === BracketType.GRAND_FINAL) {
        // Winners Finalist -> P1, Losers Finalist -> P2
        return source.bracketType === BracketType.WINNERS;
      }

      // En Losers Bracket
      if (target.bracketType === BracketType.LOSERS) {
        // Rondas Pares (Major): el que viene de ronda anterior LB siempre es P1
        if (target.round % 2 === 0) return true;
        // Rondas Impares (Minor): avance estandar 2-a-1
        return source.position % 2 !== 0;
      }

      // En Winners Bracket: posicion impar -> P1
      return source.position % 2 !== 0;
    }

    if (isLoserDrop) {
      // Perdedores de Winners que caen a Losers
      if (target.round === 1) {
        // En LBR1, dos perdedores de WBR1 se encuentran
        return source.position % 2 !== 0;
      }
      // En Rondas Mayor de LB, el perdedor que cae de WB siempre es P2
      return false;
    }

    return false;
  },

  /**
   * Obtiene el participante que un match fuente envía al match destino.
   */
  getParticipantToSeat: (source: Match, target: Match): string | null => {
    if (source.nextMatchId === target.id) return source.winnerId;
    if (source.loserNextMatchId === target.id) {
      if (!source.winnerId) return null;
      return source.winnerId === source.player1Id
        ? source.player2Id
        : source.player1Id;
    }
    return null;
  },

  /**
   * Obtiene el perdedor de un match.
   */
  getLoserFromMatch: (match: Match): string | null => {
    if (!match.winnerId) return null;
    return match.winnerId === match.player1Id
      ? match.player2Id
      : match.player1Id;
  },
};