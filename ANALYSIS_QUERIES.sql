-- ============================================================================
-- WASSERBALL ANALYTICS - SQL QUERY LIBRARY
-- ============================================================================
-- Sammlung der wichtigsten Analyse-Queries
-- Einsatzbereit und getestet
-- ============================================================================

-- ============================================================================
-- 1. TEAM STATISTIKEN
-- ============================================================================

-- 1.1 Gesamt-Bilanz aller Teams
SELECT
    t.name,
    COUNT(DISTINCT g.id) as total_games,
    SUM(CASE
        WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score)
          OR (g.guest_team_id = t.id AND g.guest_score > g.home_score)
        THEN 1 ELSE 0
    END) as wins,
    SUM(CASE WHEN g.home_score = g.guest_score THEN 1 ELSE 0 END) as draws,
    SUM(CASE
        WHEN (g.home_team_id = t.id AND g.home_score < g.guest_score)
          OR (g.guest_team_id = t.id AND g.guest_score < g.home_score)
        THEN 1 ELSE 0
    END) as losses,
    ROUND(100.0 * SUM(CASE
        WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score)
          OR (g.guest_team_id = t.id AND g.guest_score > g.home_score)
        THEN 1 ELSE 0
    END) / COUNT(DISTINCT g.id), 2) as win_rate_percent,
    ROUND(AVG(CASE
        WHEN g.home_team_id = t.id THEN g.home_score
        ELSE g.guest_score
    END), 2) as avg_goals_scored,
    ROUND(AVG(CASE
        WHEN g.home_team_id = t.id THEN g.guest_score
        ELSE g.home_score
    END), 2) as avg_goals_conceded
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id
HAVING total_games >= 10
ORDER BY win_rate_percent DESC, avg_goals_scored DESC
LIMIT 50;

-- 1.2 Heimvorteil-Analyse
SELECT
    t.name,
    COUNT(CASE WHEN g.home_team_id = t.id THEN 1 END) as home_games,
    ROUND(100.0 * SUM(CASE WHEN g.home_team_id = t.id AND g.home_score > g.guest_score THEN 1 ELSE 0 END) /
          NULLIF(COUNT(CASE WHEN g.home_team_id = t.id THEN 1 END), 0), 1) as home_win_rate,
    COUNT(CASE WHEN g.guest_team_id = t.id THEN 1 END) as away_games,
    ROUND(100.0 * SUM(CASE WHEN g.guest_team_id = t.id AND g.guest_score > g.home_score THEN 1 ELSE 0 END) /
          NULLIF(COUNT(CASE WHEN g.guest_team_id = t.id THEN 1 END), 0), 1) as away_win_rate,
    ROUND(100.0 * SUM(CASE WHEN g.home_team_id = t.id AND g.home_score > g.guest_score THEN 1 ELSE 0 END) /
          NULLIF(COUNT(CASE WHEN g.home_team_id = t.id THEN 1 END), 0) -
          100.0 * SUM(CASE WHEN g.guest_team_id = t.id AND g.guest_score > g.home_score THEN 1 ELSE 0 END) /
          NULLIF(COUNT(CASE WHEN g.guest_team_id = t.id THEN 1 END), 0), 1) as home_advantage
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
GROUP BY t.id
HAVING home_games >= 10 AND away_games >= 10
ORDER BY home_advantage DESC;

-- ============================================================================
-- 2. SPIELER STATISTIKEN
-- ============================================================================

-- 2.1 Top Scorer aller Zeiten
SELECT
    p.name,
    p.birth_year,
    2026 - p.birth_year as current_age,
    SUM(s.goals) as career_goals,
    SUM(s.games) as career_games,
    ROUND(1.0 * SUM(s.goals) / NULLIF(SUM(s.games), 0), 2) as goals_per_game,
    COUNT(DISTINCT s.league_id) as leagues_played,
    MIN(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) as first_season,
    MAX(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) as last_season,
    MAX(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) - MIN(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) + 1 as career_years
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
HAVING career_games >= 10
ORDER BY career_goals DESC
LIMIT 100;

-- 2.2 Rising Stars (junge Top-Scorer)
SELECT
    p.name,
    p.birth_year,
    2026 - p.birth_year as age,
    SUM(s.goals) as total_goals,
    SUM(s.games) as total_games,
    ROUND(1.0 * SUM(s.goals) / NULLIF(SUM(s.games), 0), 2) as goals_per_game,
    COUNT(DISTINCT SUBSTR(s.league_id, 1, 4)) as seasons_active
FROM players p
JOIN scorers s ON s.player_id = p.id
WHERE p.birth_year >= 2005
GROUP BY p.id
HAVING total_games >= 5
ORDER BY total_goals DESC
LIMIT 50;

-- 2.3 Spieler mit längster Karriere
SELECT
    p.name,
    p.birth_year,
    MIN(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) as debut_season,
    MAX(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) as last_season,
    MAX(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) - MIN(CAST(SUBSTR(s.league_id, 1, 4) AS INTEGER)) + 1 as career_years,
    COUNT(DISTINCT SUBSTR(s.league_id, 1, 4)) as seasons_played,
    SUM(s.goals) as career_goals,
    SUM(s.games) as career_games
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
HAVING seasons_played >= 5
ORDER BY career_years DESC, career_goals DESC
LIMIT 50;

-- ============================================================================
-- 3. SPIEL STATISTIKEN
-- ============================================================================

-- 3.1 Torreichste Spiele aller Zeiten
SELECT
    g.date_iso,
    t1.name as home_team,
    g.home_score,
    t2.name as guest_team,
    g.guest_score,
    g.total_goals,
    l.name as league,
    l.season_id
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
JOIN leagues l ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
ORDER BY g.total_goals DESC, ABS(g.goal_difference) ASC
LIMIT 100;

-- 3.2 Knappste Spiele (Differenz ≤ 1)
SELECT
    g.date_iso,
    t1.name as home_team,
    g.home_score,
    t2.name as guest_team,
    g.guest_score,
    g.total_goals,
    l.name as league
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
JOIN leagues l ON g.league_id = l.id
WHERE ABS(g.goal_difference) <= 1
  AND g.home_score IS NOT NULL
ORDER BY g.total_goals DESC, g.date_iso DESC
LIMIT 100;

-- 3.3 Höchste Siege (größte Differenz)
SELECT
    g.date_iso,
    t1.name as home_team,
    g.home_score,
    t2.name as guest_team,
    g.guest_score,
    ABS(g.goal_difference) as goal_difference,
    CASE WHEN g.home_score > g.guest_score THEN t1.name ELSE t2.name END as winner,
    l.name as league
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
JOIN leagues l ON g.league_id = l.id
WHERE g.home_score IS NOT NULL
ORDER BY goal_difference DESC
LIMIT 50;

-- ============================================================================
-- 4. ZEITREIHEN-ANALYSEN
-- ============================================================================

-- 4.1 Entwicklung der Tore über Saisons
SELECT
    l.season_id,
    COUNT(DISTINCT g.id) as games,
    ROUND(AVG(g.total_goals), 2) as avg_total_goals,
    MAX(g.total_goals) as highest_score,
    MIN(g.total_goals) as lowest_score,
    ROUND(AVG(ABS(g.goal_difference)), 2) as avg_goal_difference
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY l.season_id
ORDER BY l.season_id;

-- 4.2 Spiele pro Monat (saisonale Muster)
SELECT
    start_month,
    start_month_name,
    COUNT(*) as games,
    ROUND(AVG(total_goals), 2) as avg_goals,
    MAX(total_goals) as max_goals
FROM games
WHERE start_month IS NOT NULL
  AND total_goals IS NOT NULL
GROUP BY start_month, start_month_name
ORDER BY start_month;

-- 4.3 Spiele pro Wochentag
SELECT
    CASE start_day_of_week
        WHEN 'Montag' THEN 1
        WHEN 'Dienstag' THEN 2
        WHEN 'Mittwoch' THEN 3
        WHEN 'Donnerstag' THEN 4
        WHEN 'Freitag' THEN 5
        WHEN 'Samstag' THEN 6
        WHEN 'Sonntag' THEN 7
    END as day_num,
    start_day_of_week,
    COUNT(*) as games,
    ROUND(AVG(total_goals), 2) as avg_goals,
    ROUND(AVG(home_score - guest_score), 2) as avg_home_advantage
FROM games
WHERE start_day_of_week IS NOT NULL
  AND total_goals IS NOT NULL
GROUP BY start_day_of_week
ORDER BY day_num;

-- 4.4 Spiele nach Uhrzeit
SELECT
    start_hour,
    COUNT(*) as games,
    ROUND(AVG(total_goals), 2) as avg_goals
FROM games
WHERE start_hour IS NOT NULL
  AND total_goals IS NOT NULL
GROUP BY start_hour
ORDER BY start_hour;

-- ============================================================================
-- 5. VERGLEICHENDE ANALYSEN
-- ============================================================================

-- 5.1 Liga-Level Vergleich
SELECT
    CASE
        WHEN l.name LIKE '%Bundesliga%' THEN 'Bundesliga'
        WHEN l.name LIKE '%Oberliga%' THEN 'Oberliga'
        WHEN l.name LIKE '%Regionalliga%' THEN 'Regionalliga'
        WHEN l.name LIKE '%Landesliga%' THEN 'Landesliga'
        WHEN l.name LIKE '%Bezirksliga%' THEN 'Bezirksliga'
        ELSE 'Sonstige'
    END as liga_level,
    COUNT(DISTINCT g.id) as games,
    ROUND(AVG(g.total_goals), 2) as avg_goals,
    MAX(g.total_goals) as max_goals,
    ROUND(AVG(ABS(g.goal_difference)), 2) as avg_margin
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY liga_level
ORDER BY avg_goals DESC;

-- 5.2 Altersgruppen-Vergleich
SELECT
    CASE
        WHEN l.name LIKE '%U12%' THEN 'U12'
        WHEN l.name LIKE '%U14%' THEN 'U14'
        WHEN l.name LIKE '%U16%' THEN 'U16'
        WHEN l.name LIKE '%U18%' THEN 'U18'
        WHEN l.name LIKE '%U20%' THEN 'U20'
        ELSE 'Senioren'
    END as age_group,
    COUNT(*) as games,
    ROUND(AVG(g.total_goals), 2) as avg_total_goals,
    ROUND(AVG(g.home_score), 2) as avg_home_score,
    ROUND(AVG(g.guest_score), 2) as avg_guest_score
FROM leagues l
JOIN games g ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
GROUP BY age_group
ORDER BY
    CASE age_group
        WHEN 'U12' THEN 1
        WHEN 'U14' THEN 2
        WHEN 'U16' THEN 3
        WHEN 'U18' THEN 4
        WHEN 'U20' THEN 5
        ELSE 6
    END;

-- ============================================================================
-- 6. HEAD-TO-HEAD ANALYSEN
-- ============================================================================

-- 6.1 Häufigste Paarungen
SELECT
    t1.name as team1,
    t2.name as team2,
    COUNT(*) as total_encounters,
    SUM(CASE WHEN g.home_score > g.guest_score THEN 1 ELSE 0 END) as team1_wins,
    SUM(CASE WHEN g.home_score < g.guest_score THEN 1 ELSE 0 END) as team2_wins,
    SUM(CASE WHEN g.home_score = g.guest_score THEN 1 ELSE 0 END) as draws,
    ROUND(AVG(g.total_goals), 2) as avg_goals_per_game,
    MAX(g.total_goals) as highest_scoring
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE g.home_score IS NOT NULL
GROUP BY t1.id, t2.id
HAVING total_encounters >= 5
ORDER BY total_encounters DESC
LIMIT 100;

-- ============================================================================
-- 7. VENUE ANALYSEN
-- ============================================================================

-- 7.1 Top Spielorte nach Anzahl Spielen
SELECT
    v.pool_name,
    v.city,
    COUNT(g.id) as total_games,
    ROUND(AVG(g.total_goals), 2) as avg_goals
FROM venues v
JOIN games g ON g.venue_id = v.id
WHERE g.total_goals IS NOT NULL
GROUP BY v.id
ORDER BY total_games DESC
LIMIT 50;

-- ============================================================================
-- 8. SAISON-SPEZIFISCHE ANALYSEN
-- ============================================================================

-- 8.1 Aktuelle Saison Top Scorer (2025)
SELECT
    p.name,
    p.birth_year,
    s.team,
    s.goals,
    s.games,
    ROUND(1.0 * s.goals / NULLIF(s.games, 0), 2) as goals_per_game,
    l.name as league
FROM scorers s
JOIN players p ON s.player_id = p.id
JOIN leagues l ON s.league_id = l.id
WHERE l.season_id = '2025'
  AND s.games >= 5
ORDER BY s.goals DESC
LIMIT 50;

-- 8.2 Saison-Vergleich für ein Team
SELECT
    SUBSTR(g.league_id, 1, 4) as season,
    t.name,
    COUNT(*) as games,
    SUM(CASE
        WHEN (g.home_team_id = t.id AND g.home_score > g.guest_score)
          OR (g.guest_team_id = t.id AND g.guest_score > g.home_score)
        THEN 1 ELSE 0
    END) as wins,
    ROUND(AVG(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.guest_score END), 2) as avg_scored,
    ROUND(AVG(CASE WHEN g.home_team_id = t.id THEN g.guest_score ELSE g.home_score END), 2) as avg_conceded
FROM teams t
JOIN games g ON (g.home_team_id = t.id OR g.guest_team_id = t.id)
WHERE g.home_score IS NOT NULL
  AND t.name = 'Wasserfreunde Spandau 04'  -- Beispiel Team
GROUP BY season, t.id
ORDER BY season DESC;

-- ============================================================================
-- 9. UNTERHALTUNGSWERT
-- ============================================================================

-- 9.1 Spannendste Spiele (viele Tore + knappes Ergebnis)
SELECT
    g.date_iso,
    t1.name as home,
    g.home_score,
    t2.name as guest,
    g.guest_score,
    g.total_goals,
    ABS(g.goal_difference) as margin,
    -- Entertainment Score: viele Tore + knappes Spiel = hoch
    g.total_goals * (6 - LEAST(ABS(g.goal_difference), 5)) as entertainment_score,
    l.name as league
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
JOIN leagues l ON g.league_id = l.id
WHERE g.total_goals IS NOT NULL
  AND g.total_goals >= 15  -- Mindestens 15 Tore
ORDER BY entertainment_score DESC
LIMIT 100;

-- ============================================================================
-- 10. EXPORT FÜR VISUALISIERUNGEN
-- ============================================================================

-- 10.1 Daten für Heatmap: Spiele pro Monat/Jahr
SELECT
    start_year,
    start_month,
    COUNT(*) as games
FROM games
WHERE start_year IS NOT NULL
  AND start_month IS NOT NULL
GROUP BY start_year, start_month
ORDER BY start_year, start_month;

-- 10.2 Daten für Network Graph: Team-Begegnungen
SELECT
    t1.name as source,
    t2.name as target,
    COUNT(*) as weight
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE g.home_score IS NOT NULL
GROUP BY t1.id, t2.id
HAVING weight >= 3
ORDER BY weight DESC;

-- ============================================================================
-- ENDE
-- ============================================================================
