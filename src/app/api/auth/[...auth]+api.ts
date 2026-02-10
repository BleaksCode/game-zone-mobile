/**
 * app/api/auth/[...auth]+api.ts
 * --------------------------------
 * Catch-all handler de Better-Auth para Expo API Routes.
 *
 * Enruta automáticamente todas las peticiones de autenticación:
 *   - POST /api/auth/sign-up/email
 *   - POST /api/auth/sign-in/email
 *   - POST /api/auth/sign-out
 *   - GET  /api/auth/session
 *   - POST /api/auth/verify-email
 *   - etc.
 *
 * No requiere configuración adicional: Better-Auth maneja
 * todo el routing internamente.
 */

import { auth } from '@/lib/auth';

/**
 * Handler genérico que delega a Better-Auth.
 * Better-Auth detecta el método y path automáticamente.
 */
function handler(request: Request) {
  return auth.handler(request);
}

export const GET = handler;
export const POST = handler;
