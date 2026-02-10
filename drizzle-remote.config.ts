/**
 * drizzle-remote.config.ts
 * --------------------------
 * Configuración de Drizzle Kit para migraciones PostgreSQL (Supabase).
 *
 * Uso:
 *   npx drizzle-kit generate --config=drizzle-remote.config.ts
 *   npx drizzle-kit push --config=drizzle-remote.config.ts
 *
 * Requiere la variable de entorno SUPABASE_DB_URL.
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './db/remote-schema.ts',
  out: './drizzle/remote-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL!,
  },
} satisfies Config;
