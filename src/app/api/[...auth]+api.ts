/**
 * src/app/api/auth/[...auth]+api.ts
 * --------------------------------
 * Catch-all handler de Better-Auth.
 * Este archivo conecta las peticiones HTTP del móvil con la lógica de auth.ts
 */

import { auth } from '@/src/lib/auth'; // Importa la configuración del servidor

function handler(request: Request) {
  return auth.handler(request);
}

export const GET = handler;
export const POST = handler;