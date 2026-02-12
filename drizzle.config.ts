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

import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
  dbCredentials: {
    url: 'file:./app-db.db',
  },
});

