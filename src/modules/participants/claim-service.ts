/**
 * modules/participants/claim-service.ts
 * ----------------------------------------
 * Servicio de reclamación (claim) de participantes casuales.
 *
 * Flujo:
 * 1. El organizador registra un participante casual con nombre + email.
 * 2. Un usuario registrado con el mismo email verificado puede
 *    "reclamar" ese perfil casual antes de que el torneo pase a 'active'.
 * 3. Al reclamar, se vincula el linkedUserId del participante
 *    con el ID del usuario registrado.
 *
 * Restricciones:
 *   - Solo funciona si tournament.status === 'draft'.
 *   - El email del usuario debe estar verificado.
 *   - El email del participante debe coincidir con el del usuario.
 *   - Un participante solo puede ser reclamado una vez.
 */

import { TournamentRepository } from '@/modules/tournaments/repository';
import { ParticipantRepository } from '@/modules/participants/repository';
import { TournamentStatus } from '@/db/schema';

interface ClaimResult {
  success: boolean;
  message: string;
  participantId?: string;
}

export const ClaimService = {
  /**
   * Intenta vincular un usuario registrado con un participante casual.
   *
   * @param tournamentId - ID del torneo.
   * @param userId - ID del usuario registrado (Better-Auth).
   * @param userEmail - Email verificado del usuario registrado.
   */
  claimParticipant: async (
    tournamentId: string,
    userId: string,
    userEmail: string,
  ): Promise<ClaimResult> => {
    // 1. Verificar que el torneo existe y está en draft
    const tournament = await TournamentRepository.getById(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Torneo no encontrado' };
    }
    if (tournament.status !== TournamentStatus.DRAFT) {
      return {
        success: false,
        message: 'Solo se puede reclamar un perfil mientras el torneo esté en estado borrador',
      };
    }

    // 2. Buscar participante casual por email en el torneo
    const participant = await ParticipantRepository.getByEmailAndTournament(
      userEmail,
      tournamentId,
    );
    if (!participant) {
      return {
        success: false,
        message: 'No se encontró un participante casual con ese email en este torneo',
      };
    }

    // 3. Verificar que no ha sido reclamado previamente
    if (participant.linkedUserId) {
      return {
        success: false,
        message: 'Este participante ya fue vinculado a una cuenta',
      };
    }

    // 4. Vincular
    await ParticipantRepository.linkUser(participant.id, userId);

    return {
      success: true,
      message: 'Participante vinculado exitosamente',
      participantId: participant.id,
    };
  },

  /**
   * Verifica si un usuario tiene un perfil casual reclamable en un torneo.
   */
  checkClaimable: async (
    tournamentId: string,
    userEmail: string,
  ): Promise<{ claimable: boolean; participantId?: string }> => {
    const tournament = await TournamentRepository.getById(tournamentId);
    if (!tournament || tournament.status !== TournamentStatus.DRAFT) {
      return { claimable: false };
    }

    const participant = await ParticipantRepository.getByEmailAndTournament(
      userEmail,
      tournamentId,
    );

    if (!participant || participant.linkedUserId) {
      return { claimable: false };
    }

    return { claimable: true, participantId: participant.id };
  },
};
