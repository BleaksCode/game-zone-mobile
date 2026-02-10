/**
 * db/client.ts
 * --------------
 * Clientes Drizzle ORM para SQLite (local) y PostgreSQL (Supabase remoto).
 *
 * CORRECCIÓN APLICADA:
 * Se han eliminado las importaciones estáticas de 'expo-sqlite' y 'drizzle-orm/expo-sqlite'.
 * Ahora se usan `require` dinámicos dentro de funciones para evitar que el
 * entorno de servidor (API Routes) intente cargar módulos nativos de móvil.
 */

import * as schema from './schema';
import * as remoteSchema from './remote-schema';

// ---------------------------------------------------------------------------
// 1. SQLite Local (Cliente — React Native)
// ---------------------------------------------------------------------------

let _localDb: ReturnType<typeof import('drizzle-orm/expo-sqlite').drizzle> | null = null;

/**
 * Obtiene la instancia de la base de datos local (SQLite).
 * Úsala en tus componentes y hooks (ej. useQuery).
 * * @returns Instancia de Drizzle SQLite
 */
export function getLocalDb() {
  // Si ya existe la instancia, la devolvemos (Singleton)
  if (_localDb) return _localDb;

  // Verificación de seguridad: Si estamos en el servidor, devolvemos null
  // (Aunque idealmente este código nunca debería llamarse desde el servidor)
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // Importaciones dinámicas (solo se ejecutan en el móvil)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openDatabaseSync } = require('expo-sqlite');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require('drizzle-orm/expo-sqlite');

    const expoDb = openDatabaseSync('tournament-manager.db', {
      enableChangeListener: true,
    });
    
    _localDb = drizzle(expoDb, { schema });
    return _localDb;
  } catch (error) {
    console.error("Error inicializando SQLite local:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. PostgreSQL Remoto (Servidor — API Routes)
// ---------------------------------------------------------------------------

let _remoteDb: ReturnType<typeof import('drizzle-orm/postgres-js').drizzle> | null = null;

/**
 * Crea y retorna la instancia de Drizzle ORM sobre PostgreSQL (Supabase).
 * Se usa EXCLUSIVAMENTE en las API Routes del servidor (app/api/...).
 */
export function getRemoteDb() {
  if (_remoteDb) return _remoteDb;

  // Importaciones dinámicas para que solo corran en Node.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require('postgres');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/postgres-js');

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error(
      'SUPABASE_DB_URL no está definida. Configura la variable de entorno.',
    );
  }

  console.log("--- URL DETECTADA POR EL SISTEMA ---");
  console.log(connectionString); 
  console.log("------------------------------------");

  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,      // Obligatorio para Supabase Pooler
    ssl: 'require',
  });

  _remoteDb = drizzle(client, { schema: remoteSchema });
  return _remoteDb;
}

// ---------------------------------------------------------------------------
// 3. Inicialización del esquema local (Solo Móvil)
// ---------------------------------------------------------------------------

/**
 * Crea las tablas locales de SQLite si no existen.
 * Debe llamarse una vez al inicio de la app (en el layout raíz).
 */
export async function initLocalDatabase(): Promise<void> {
  // Protección para no ejecutar en servidor
  if (typeof window === 'undefined') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openDatabaseSync } = require('expo-sqlite');
    
    const expoDb = openDatabaseSync('tournament-manager.db');

    expoDb.execSync(`
      -- Better-Auth tables
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at TEXT,
        refresh_token_expires_at TEXT,
        scope TEXT,
        password TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Domain tables
      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        organizer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('single_elimination', 'double_elimination')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
        best_of INTEGER NOT NULL DEFAULT 1,
        max_participants INTEGER NOT NULL DEFAULT 16,
        sync_status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        nickname TEXT NOT NULL,
        email TEXT,
        linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        seed INTEGER,
        is_bye INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        round INTEGER NOT NULL,
        position INTEGER NOT NULL,
        bracket_type TEXT NOT NULL DEFAULT 'WINNERS' CHECK (bracket_type IN ('WINNERS', 'LOSERS', 'GRAND_FINAL')),
        player1_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
        player2_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
        player1_score INTEGER,
        player2_score INTEGER,
        winner_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
        next_match_id TEXT,
        loser_next_match_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_synced_at TEXT
      );

      -- Indices
      CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON tournaments(organizer_id);
      CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
      CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);
      CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_matches_bracket ON matches(tournament_id, bracket_type);
    `);
  } catch (e) {
    console.error('Error al inicializar tablas locales:', e);
  }
}