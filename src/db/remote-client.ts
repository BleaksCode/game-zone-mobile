/**
 * src/db/remote-client.ts
 * -----------------------
 * Cliente Drizzle para PostgreSQL (Supabase).
 * SE USA EXCLUSIVAMENTE EN API ROUTES (+api.ts).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as remoteSchema from './remote-schema';

let _remoteDb: ReturnType<typeof drizzle> | null = null;

export function getRemoteDb() {
  if (_remoteDb) return _remoteDb;

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL no está definida. Configura la variable de entorno.');
  }

  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: 'require',
  });

  _remoteDb = drizzle(client, { schema: remoteSchema });
  return _remoteDb;
}