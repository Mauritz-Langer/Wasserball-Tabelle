-- ============================================================================
-- Database Cleanup Script - Phase 2: Datenbereinigung
-- ============================================================================
-- Beschreibung: Entfernt Duplikate und bereinigt inkonsistente Daten
-- Ausführung: sqlite3 src/assets/data/seasons.db < scripts/cleanup-data.sql
-- WICHTIG: Vorher Backup erstellen!
-- ============================================================================

BEGIN TRANSACTION;

SELECT '🧹 Starting data cleanup...';

-- ============================================================================
-- 1. DUPLIKATE ENTFERNEN
-- ============================================================================

SELECT '🔍 Checking for duplicates in scorers...';

-- Zähle Duplikate
SELECT COUNT(*) - COUNT(DISTINCT league_id || name || team) as duplicate_count
FROM scorers;

-- Entferne Duplikate (behalte den mit der höchsten rowid)
DELETE FROM scorers
WHERE rowid NOT IN (
    SELECT MAX(rowid)
    FROM scorers
    GROUP BY league_id, name, team
);

SELECT '✅ Removed ' || changes() || ' duplicate scorers';

-- ============================================================================
-- 2. LEERE/NULL WERTE BEREINIGEN
-- ============================================================================

SELECT '🔍 Cleaning null values...';

-- Games: Leere results normalisieren
UPDATE games
SET result = NULL
WHERE result IN ('', ' ', '-', ' - ', '  -  ');

SELECT '✅ Cleaned ' || changes() || ' game results';

-- Scorers: Leere birth_year normalisieren
UPDATE scorers
SET birth_year = NULL
WHERE birth_year IN ('', ' ', '-');

-- Locations normalisieren
UPDATE games
SET location = TRIM(location)
WHERE location LIKE '% ' OR location LIKE ' %';

-- ============================================================================
-- 3. INKONSISTENTE TEAM-NAMEN
-- ============================================================================

SELECT '🔍 Finding team name inconsistencies...';

-- Teams mit Leerzeichen-Problemen
CREATE TEMP TABLE team_variations AS
SELECT DISTINCT
    TRIM(home_team) as normalized_name,
    home_team as original_name,
    COUNT(*) as occurrences
FROM games
WHERE home_team != TRIM(home_team)
GROUP BY home_team
UNION
SELECT DISTINCT
    TRIM(guest_team) as normalized_name,
    guest_team as original_name,
    COUNT(*) as occurrences
FROM games
WHERE guest_team != TRIM(guest_team)
GROUP BY guest_team;

-- Zeige Inkonsistenzen
SELECT * FROM team_variations ORDER BY occurrences DESC;

-- Normalisiere Team-Namen
UPDATE games SET home_team = TRIM(home_team);
UPDATE games SET guest_team = TRIM(guest_team);
UPDATE scorers SET team = TRIM(team);
UPDATE table_entries SET team = TRIM(team);

SELECT '✅ Normalized team names';

-- ============================================================================
-- 4. DATUM-FORMAT VALIDIERUNG
-- ============================================================================

SELECT '🔍 Checking date formats...';

-- Finde ungültige Datumsformate
SELECT COUNT(*) as invalid_dates
FROM games
WHERE start_time NOT LIKE '__.__.__%, __:__ Uhr'
  AND start_time IS NOT NULL
  AND start_time != '';

-- ============================================================================
-- 5. REFERENZIELLE INTEGRITÄT
-- ============================================================================

SELECT '🔍 Checking referential integrity...';

-- Games ohne League
SELECT COUNT(*) as orphaned_games
FROM games g
LEFT JOIN leagues l ON g.league_id = l.id
WHERE l.id IS NULL;

-- Scorers ohne League
SELECT COUNT(*) as orphaned_scorers
FROM scorers s
LEFT JOIN leagues l ON s.league_id = l.id
WHERE l.id IS NULL;

-- Game Events ohne Game
SELECT COUNT(*) as orphaned_events
FROM game_events e
LEFT JOIN games g ON e.game_id = g.id
WHERE g.id IS NULL;

-- ============================================================================
-- 6. STATISTIKEN AKTUALISIEREN
-- ============================================================================

SELECT '📊 Updating statistics...';

-- Spiele pro Liga zählen und in temporärer Tabelle speichern
CREATE TEMP TABLE league_stats AS
SELECT
    league_id,
    COUNT(*) as total_games,
    COUNT(CASE WHEN result IS NOT NULL AND result != ' - ' THEN 1 END) as finished_games
FROM games
GROUP BY league_id;

-- Zeige Ligen ohne Spiele
SELECT l.id, l.name, l.season_id
FROM leagues l
LEFT JOIN league_stats ls ON l.id = ls.league_id
WHERE ls.total_games IS NULL OR ls.total_games = 0
LIMIT 10;

-- ============================================================================
-- 7. DATENBANK OPTIMIEREN
-- ============================================================================

SELECT '🔧 Optimizing database...';

-- Rebuild mit VACUUM (gibt Speicher frei)
VACUUM;

-- Update Statistiken für Query Optimizer
ANALYZE;

-- ============================================================================
-- ZUSAMMENFASSUNG
-- ============================================================================

SELECT '✅ Cleanup completed!';

SELECT '📊 Final Statistics:';
SELECT 'Total Games' as metric, COUNT(*) as count FROM games
UNION ALL
SELECT 'Games with Results', COUNT(*) FROM games WHERE result IS NOT NULL AND result != ' - '
UNION ALL
SELECT 'Total Scorers', COUNT(*) FROM scorers
UNION ALL
SELECT 'Total Leagues', COUNT(*) FROM leagues
UNION ALL
SELECT 'Total Events', COUNT(*) FROM game_events;

COMMIT;

SELECT '✅ All changes committed successfully!';
