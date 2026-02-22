-- ============================================================================
-- Database Optimization Script - Phase 1: Indizes
-- ============================================================================
-- Beschreibung: Fügt kritische Indizes hinzu für schnellere Abfragen
-- Ausführung: sqlite3 src/assets/data/seasons.db < scripts/add-indexes.sql
-- Geschätzte Zeit: 1-2 Minuten
-- Erwartete Verbesserung: 10-100x schnellere Queries
-- ============================================================================

BEGIN TRANSACTION;

-- Logging
SELECT '🔧 Adding database indexes...';
SELECT datetime('now') as start_time;

-- ============================================================================
-- 1. PRIMÄRE LOOKUP-INDIZES
-- ============================================================================

-- Games Table - häufigste Queries
CREATE INDEX IF NOT EXISTS idx_games_league_id ON games(league_id);
CREATE INDEX IF NOT EXISTS idx_games_start_time ON games(start_time);
CREATE INDEX IF NOT EXISTS idx_games_result ON games(result);
CREATE INDEX IF NOT EXISTS idx_games_processed ON games(is_details_processed);

-- Leagues Table
CREATE INDEX IF NOT EXISTS idx_leagues_season_id ON leagues(season_id);
CREATE INDEX IF NOT EXISTS idx_leagues_processed ON leagues(is_processed);

-- Table Entries
CREATE INDEX IF NOT EXISTS idx_table_entries_league_id ON table_entries(league_id);
CREATE INDEX IF NOT EXISTS idx_table_entries_place ON table_entries(league_id, place);

-- Scorers
CREATE INDEX IF NOT EXISTS idx_scorers_league_id ON scorers(league_id);
CREATE INDEX IF NOT EXISTS idx_scorers_goals ON scorers(goals DESC);
CREATE INDEX IF NOT EXISTS idx_scorers_name ON scorers(name);

-- ============================================================================
-- 2. FOREIGN KEY INDIZES (für JOINs)
-- ============================================================================

-- Game Details Tables
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_player ON game_events(player);
CREATE INDEX IF NOT EXISTS idx_game_quarter_scores_game_id ON game_quarter_scores(game_id);
CREATE INDEX IF NOT EXISTS idx_game_officials_game_id ON game_officials(game_id);
CREATE INDEX IF NOT EXISTS idx_game_lineups_game_id ON game_lineups(game_id);
CREATE INDEX IF NOT EXISTS idx_game_lineups_name ON game_lineups(name);
CREATE INDEX IF NOT EXISTS idx_game_team_details_game_id ON game_team_details(game_id);

-- ============================================================================
-- 3. COMPOSITE INDIZES (für spezifische Queries)
-- ============================================================================

-- Spiele nach Liga und Ergebnis
CREATE INDEX IF NOT EXISTS idx_games_league_result ON games(league_id, result);

-- Spiele nach Teams (für Team-Statistiken)
CREATE INDEX IF NOT EXISTS idx_games_home_team ON games(home_team);
CREATE INDEX IF NOT EXISTS idx_games_guest_team ON games(guest_team);

-- Events nach Zeit (für Timeline)
CREATE INDEX IF NOT EXISTS idx_game_events_time ON game_events(game_id, period, time);

-- Lineups nach Team-Seite
CREATE INDEX IF NOT EXISTS idx_game_lineups_team ON game_lineups(game_id, team_side);

-- ============================================================================
-- 4. UNIQUE CONSTRAINTS (Datenintegrität)
-- ============================================================================

-- Scorer Duplikate verhindern
CREATE UNIQUE INDEX IF NOT EXISTS idx_scorers_unique
    ON scorers(league_id, name, team);

-- Quarter Scores Duplikate verhindern
CREATE UNIQUE INDEX IF NOT EXISTS idx_quarter_scores_unique
    ON game_quarter_scores(game_id, quarter);

-- ============================================================================
-- ANALYZE für Optimizer
-- ============================================================================

SELECT '📊 Running ANALYZE...';
ANALYZE;

-- ============================================================================
-- Statistiken ausgeben
-- ============================================================================

SELECT '✅ Indexes created successfully!';
SELECT COUNT(*) || ' indexes now exist' as result
FROM sqlite_master
WHERE type='index' AND name NOT LIKE 'sqlite_%';

SELECT datetime('now') as end_time;

COMMIT;
