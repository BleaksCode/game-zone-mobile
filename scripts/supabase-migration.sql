-- =============================================================================
-- scripts/supabase-migration.sql
-- Migración para crear las tablas en Supabase (PostgreSQL).
-- Ejecutar en el SQL Editor de Supabase Dashboard.
-- =============================================================================

-- Habilitar extensión uuid-ossp (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Better-Auth Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Domain Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single_elimination', 'double_elimination')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  best_of INTEGER NOT NULL DEFAULT 1,
  max_participants INTEGER NOT NULL DEFAULT 16,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  email TEXT,
  linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  seed INTEGER,
  is_bye BOOLEAN NOT NULL DEFAULT FALSE,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
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
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

-- ============================================================================
-- Indices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_linked_user ON participants(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_bracket ON matches(tournament_id, bracket_type);
CREATE INDEX IF NOT EXISTS idx_matches_next ON matches(next_match_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Habilitar RLS en todas las tablas de dominio
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Política: Los organizadores solo pueden ver/modificar SUS torneos.
-- Nota: Las API Routes usan el service_role key que bypasea RLS.
-- Estas políticas protegen el acceso directo vía Supabase Client (si se usa).

-- TOURNAMENTS: Solo el organizador puede CRUD
CREATE POLICY "Organizers can manage own tournaments"
  ON tournaments
  FOR ALL
  USING (organizer_id = current_setting('request.jwt.claims')::json->>'sub')
  WITH CHECK (organizer_id = current_setting('request.jwt.claims')::json->>'sub');

-- Lectura pública de torneos activos (para espectadores)
CREATE POLICY "Public can view active tournaments"
  ON tournaments
  FOR SELECT
  USING (status IN ('active', 'completed'));

-- PARTICIPANTS: El organizador del torneo puede gestionar
CREATE POLICY "Organizers can manage tournament participants"
  ON participants
  FOR ALL
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE organizer_id = current_setting('request.jwt.claims')::json->>'sub'
    )
  )
  WITH CHECK (
    tournament_id IN (
      SELECT id FROM tournaments WHERE organizer_id = current_setting('request.jwt.claims')::json->>'sub'
    )
  );

-- Lectura pública de participantes de torneos activos
CREATE POLICY "Public can view participants of active tournaments"
  ON participants
  FOR SELECT
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE status IN ('active', 'completed')
    )
  );

-- MATCHES: El organizador del torneo puede gestionar
CREATE POLICY "Organizers can manage tournament matches"
  ON matches
  FOR ALL
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE organizer_id = current_setting('request.jwt.claims')::json->>'sub'
    )
  )
  WITH CHECK (
    tournament_id IN (
      SELECT id FROM tournaments WHERE organizer_id = current_setting('request.jwt.claims')::json->>'sub'
    )
  );

-- Lectura pública de matches de torneos activos
CREATE POLICY "Public can view matches of active tournaments"
  ON matches
  FOR SELECT
  USING (
    tournament_id IN (
      SELECT id FROM tournaments WHERE status IN ('active', 'completed')
    )
  );

-- ============================================================================
-- Función para actualizar updated_at automáticamente
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para auto-update de updated_at
CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
