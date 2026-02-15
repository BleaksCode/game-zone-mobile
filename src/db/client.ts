/**
 * src/db/client.ts
 * ----------------
 * Cliente Drizzle para SQLite local.
 * SE USA EN EL MÓVIL (Componentes y Hooks).
 *
 * NOTA: La conexión remota (PostgreSQL) se ha movido a 'remote-client.ts'
 * para evitar errores de bundling en Android.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

let _localDb: ReturnType<typeof drizzle> | null = null;

/**
 * Obtiene la instancia de la base de datos local (SQLite).
 * Úsala en tus componentes y hooks.
 */
export function getLocalDb() {
  // Si ya existe la instancia, la devolvemos (Singleton)
  if (_localDb) return _localDb;

  // Verificación de seguridad: Si estamos en el servidor (SSR/API), devolvemos null
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const expoDb = openDatabaseSync('app-db.db', {
      enableChangeListener: true,
    });
    
    _localDb = drizzle(expoDb, { schema });
    return _localDb;
  } catch (error) {
    console.error("Error inicializando SQLite local:", error);
    return null;
  }
}

/**
 * Crea las tablas locales de SQLite si no existen.
 * Debe llamarse una vez al inicio de la app.
 */
export async function initLocalDatabase(): Promise<void> {
  // Protección para no ejecutar en servidor
  if (typeof window === 'undefined') return;

  try {
    const expoDb = openDatabaseSync('app-db.db');

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