/**
 * drizzle.config.ts
 * -------------------
 * Configuración de Drizzle Kit para generación de migraciones.
 *
 * Este archivo define DOS configuraciones:
 *   1. SQLite local (default export) — para el archivo .db del dispositivo.
 *   2. PostgreSQL remoto — para Supabase (ejecutado manualmente).
 *
 * Uso:
 *   npx drizzle-kit generate    -> Genera migraciones SQLite
 *   npx drizzle-kit push        -> Aplica migraciones SQLite
 *   npx drizzle-kit generate --config=drizzle-remote.config.ts -> Genera migraciones PG
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
