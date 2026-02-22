# 🔬 Erweiterte Verbesserungen für Datenanalyse

Basierend auf der Analyse der Tabellenstruktur gibt es mehrere zusätzliche Verbesserungen, die die **Datenanalyse** erheblich vereinfachen würden.

---

## 🎯 Kritische Verbesserungen für bessere Analyse

### 1. **Strukturierte Datums-Felder** 🔴

#### Problem
```sql
start_time: "04.10.25, 16:00 Uhr"  -- TEXT
end_time:   "04.10.2025 17:09 Uhr" -- TEXT
```

**Auswirkung auf Analyse:**
- ❌ Kann nicht nach Monat/Jahr gruppieren
- ❌ Schwierig Zeitreihen zu erstellen
- ❌ Keine Sortierung nach tatsächlichem Datum
- ❌ Berechnung von Zeiträumen kompliziert

#### Lösung: Separate Datums-Komponenten

```sql
ALTER TABLE games ADD COLUMN start_date DATE;        -- '2025-10-04'
ALTER TABLE games ADD COLUMN start_year INTEGER;     -- 2025
ALTER TABLE games ADD COLUMN start_month INTEGER;    -- 10
ALTER TABLE games ADD COLUMN start_day_of_week TEXT; -- 'Samstag'
ALTER TABLE games ADD COLUMN start_hour INTEGER;     -- 16
ALTER TABLE games ADD COLUMN duration_minutes INTEGER; -- Spieldauer
```

**Vorteile für Analyse:**
```sql
-- Spiele pro Monat
SELECT start_month, COUNT(*) FROM games GROUP BY start_month;

-- Spiele an Wochenenden
SELECT COUNT(*) FROM games WHERE start_day_of_week IN ('Samstag', 'Sonntag');

-- Durchschnittliche Spieldauer
SELECT AVG(duration_minutes) FROM games WHERE duration_minutes IS NOT NULL;
```

---

### 2. **Separate Ergebnis-Spalten** 🔴

#### Problem
```sql
result: "27:5"  -- TEXT
```

**Auswirkung:**
- ❌ Statistiken schwierig (Durchschnitt, Summen)
- ❌ Kann nicht nach Tordifferenz filtern
- ❌ Knappste Spiele schwer zu finden

#### Lösung

```sql
ALTER TABLE games ADD COLUMN home_score INTEGER;
ALTER TABLE games ADD COLUMN guest_score INTEGER;
ALTER TABLE games ADD COLUMN goal_difference INTEGER; -- Automatisch berechnet
ALTER TABLE games ADD COLUMN total_goals INTEGER;     -- Summe
ALTER TABLE games ADD COLUMN is_overtime BOOLEAN;     -- Verlängerung?
```

**Migrations-Script:**
```javascript
// In scrape-seasons.js beim Parsen
const [home, guest] = result.split(':').map(s => parseInt(s.trim()));
db.exec(`
    UPDATE games SET 
        home_score = ${home},
        guest_score = ${guest},
        goal_difference = ${home - guest},
        total_goals = ${home + guest}
    WHERE result = '${result}'
`);
```

**Vorteile für Analyse:**
```sql
-- Höchste Siege
SELECT home_team, guest_team, home_score, guest_score 
FROM games 
ORDER BY ABS(goal_difference) DESC 
LIMIT 10;

-- Torreichste Spiele
SELECT * FROM games ORDER BY total_goals DESC LIMIT 10;

-- Durchschnitt Tore pro Liga
SELECT league_id, AVG(total_goals) as avg_goals
FROM games
GROUP BY league_id;

-- Knappe Spiele (Differenz ≤ 2)
SELECT COUNT(*) FROM games WHERE ABS(goal_difference) <= 2;
```

---

### 3. **Team-Tabelle (Normalisierung)** 🟠

#### Problem
- Team-Namen 718x dupliziert
- Keine zentrale Team-Info
- Schwierig Team-Statistiken zu erstellen

#### Lösung: Teams-Tabelle mit erweiterten Infos

```sql
CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    short_name TEXT,
    city TEXT,
    region TEXT,              -- 'Bayern', 'NRW', etc.
    founded_year INTEGER,
    logo_url TEXT,
    
    -- Statistiken (cached)
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_goals_scored INTEGER DEFAULT 0,
    total_goals_conceded INTEGER DEFAULT 0,
    
    -- Metadata
    first_season TEXT,
    last_season TEXT,
    is_active BOOLEAN DEFAULT 1,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Geografische Zuordnung für Karten
ALTER TABLE teams ADD COLUMN latitude REAL;
ALTER TABLE teams ADD COLUMN longitude REAL;
```

**Vorteile:**
```sql
-- Top Teams nach Region
SELECT region, COUNT(*) as teams
FROM teams
GROUP BY region;

-- Aktivste Teams
SELECT name, total_games
FROM teams
ORDER BY total_games DESC
LIMIT 10;

-- Beste Tordifferenz
SELECT name, (total_goals_scored - total_goals_conceded) as diff
FROM teams
ORDER BY diff DESC;
```

---

### 4. **Spieler-Tabelle** 🟠

#### Problem
- Spieler nur als Text in scorers/lineups
- Keine Spieler-ID → Verwechslungen möglich
- Keine Karriere-Verfolgung über Saisons

#### Lösung

```sql
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    birth_year INTEGER,
    current_team_id INTEGER REFERENCES teams(id),
    position TEXT,            -- 'Torwart', 'Feldspieler'
    jersey_number INTEGER,
    
    -- Karriere-Statistiken (cached)
    career_goals INTEGER DEFAULT 0,
    career_games INTEGER DEFAULT 0,
    career_fouls INTEGER DEFAULT 0,
    seasons_played INTEGER DEFAULT 0,
    
    -- Metadata
    first_season TEXT,
    last_season TEXT,
    is_active BOOLEAN DEFAULT 1,
    
    UNIQUE(name, birth_year)
);

-- Verknüpfungstabelle: Spieler ↔ Teams pro Saison
CREATE TABLE player_team_seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    team_id INTEGER REFERENCES teams(id),
    season_id TEXT REFERENCES seasons(id),
    goals INTEGER DEFAULT 0,
    games INTEGER DEFAULT 0,
    
    UNIQUE(player_id, team_id, season_id)
);
```

**Vorteile:**
```sql
-- Spieler-Karriere über alle Saisons
SELECT p.name, SUM(pts.goals) as total_goals, COUNT(DISTINCT pts.season_id) as seasons
FROM players p
JOIN player_team_seasons pts ON p.id = pts.player_id
GROUP BY p.id
ORDER BY total_goals DESC;

-- Team-Wechsel nachvollziehen
SELECT p.name, t.name as team, pts.season_id, pts.goals
FROM players p
JOIN player_team_seasons pts ON p.id = pts.player_id
JOIN teams t ON pts.team_id = t.id
WHERE p.name LIKE '%Mitterbauer%'
ORDER BY pts.season_id;

-- Jüngste Torschützen
SELECT name, birth_year, career_goals
FROM players
WHERE birth_year >= 2010
ORDER BY career_goals DESC;
```

---

### 5. **Materialized Views für Statistiken** 🟡

#### Problem
- Statistiken werden bei jedem Zugriff neu berechnet
- Langsam bei großen Datenmengen

#### Lösung: Vorberechnete Tabellen

```sql
-- Team-Statistiken pro Saison
CREATE TABLE team_season_stats (
    id TEXT PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id),
    season_id TEXT REFERENCES seasons(id),
    league_id TEXT REFERENCES leagues(id),
    
    games_played INTEGER,
    games_won INTEGER,
    games_drawn INTEGER,
    games_lost INTEGER,
    
    goals_scored INTEGER,
    goals_conceded INTEGER,
    goal_difference INTEGER,
    
    home_games INTEGER,
    home_wins INTEGER,
    away_games INTEGER,
    away_wins INTEGER,
    
    points INTEGER,
    final_position INTEGER,
    
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Liga-Statistiken
CREATE TABLE league_stats (
    league_id TEXT PRIMARY KEY,
    season_id TEXT REFERENCES seasons(id),
    
    total_games INTEGER,
    finished_games INTEGER,
    total_goals INTEGER,
    avg_goals_per_game REAL,
    
    highest_scoring_game_id TEXT,
    closest_game_id TEXT,
    
    top_scorer_id INTEGER,
    top_scorer_goals INTEGER,
    
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Saison-Übersicht
CREATE TABLE season_summary (
    season_id TEXT PRIMARY KEY,
    total_leagues INTEGER,
    total_games INTEGER,
    total_goals INTEGER,
    total_players INTEGER,
    
    most_active_team_id INTEGER,
    top_scorer_id INTEGER,
    
    start_date TEXT,
    end_date TEXT,
    
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Update-Trigger:**
```sql
-- Automatisches Update bei Spiel-Insert
CREATE TRIGGER update_team_stats AFTER INSERT ON games
BEGIN
    -- Team-Stats updaten
    UPDATE team_season_stats SET
        games_played = games_played + 1,
        goals_scored = goals_scored + NEW.home_score
    WHERE team_id = NEW.home_team_id AND season_id = ...;
END;
```

**Vorteile:**
```sql
-- Sehr schnelle Abfragen!
SELECT * FROM team_season_stats WHERE season_id = '2025';
SELECT * FROM league_stats ORDER BY avg_goals_per_game DESC;
```

---

### 6. **Event-Analyse Verbesserungen** 🟡

#### Problem
- Zeit als TEXT → Schwer zu analysieren
- Keine Kategorisierung

#### Lösung

```sql
ALTER TABLE game_events ADD COLUMN time_minutes INTEGER;  -- 0-32 Minuten
ALTER TABLE game_events ADD COLUMN time_seconds INTEGER;  -- Gesamtsekunden
ALTER TABLE game_events ADD COLUMN is_power_play BOOLEAN; -- Überzahl?
ALTER TABLE game_events ADD COLUMN is_penalty BOOLEAN;    -- Strafwurf?

-- Kategorisierung
CREATE TABLE event_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT UNIQUE,
    category TEXT,  -- 'goal', 'foul', 'timeout', etc.
    points INTEGER  -- Wertung
);
```

**Analyse-Möglichkeiten:**
```sql
-- Tore nach Spielminute
SELECT 
    CAST(time_minutes / 4 AS INTEGER) * 4 as minute_bucket,
    COUNT(*) as goals
FROM game_events
WHERE event_type = 'goal'
GROUP BY minute_bucket;

-- Kritische Phasen (meiste Tore)
SELECT period, COUNT(*) as goals
FROM game_events
WHERE event_type = 'goal'
GROUP BY period;

-- Überzahl-Tore
SELECT COUNT(*) FROM game_events WHERE is_power_play = 1;
```

---

### 7. **Geografische Daten** 🟢

#### Aktuell
- location: "Berlin" (TEXT)
- pool_city: "Sachsendamm 11, 10829 Berlin" (TEXT)

#### Verbesserung

```sql
CREATE TABLE venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pool_name TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    
    latitude REAL,
    longitude REAL,
    
    capacity INTEGER,
    pool_length INTEGER,  -- 25m oder 50m
    
    UNIQUE(pool_name, city)
);

-- Games referenzieren venue
ALTER TABLE games ADD COLUMN venue_id INTEGER REFERENCES venues(id);
```

**Vorteile:**
```sql
-- Spiele auf Karte anzeigen
SELECT v.latitude, v.longitude, COUNT(*) as games
FROM games g
JOIN venues v ON g.venue_id = v.id
GROUP BY v.id;

-- Reisedistanzen berechnen
-- (mit Haversine-Formel)
```

---

### 8. **Full-Text Search Tabellen** 🟢

```sql
-- Für schnelle Suche
CREATE VIRTUAL TABLE players_fts USING fts5(
    name,
    team,
    content='players'
);

CREATE VIRTUAL TABLE teams_fts USING fts5(
    name,
    city,
    content='teams'
);

-- Suche
SELECT * FROM players_fts WHERE players_fts MATCH 'mitt*';
```

---

### 9. **Historische Daten / Changelog** 🟢

```sql
-- Für Audit und Änderungs-Tracking
CREATE TABLE data_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT,
    record_id TEXT,
    change_type TEXT,  -- 'insert', 'update', 'delete'
    old_value TEXT,    -- JSON
    new_value TEXT,    -- JSON
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT    -- 'scraper', 'manual', etc.
);

-- Trigger für games
CREATE TRIGGER track_game_changes AFTER UPDATE ON games
BEGIN
    INSERT INTO data_changes (table_name, record_id, change_type, old_value, new_value)
    VALUES ('games', NEW.id, 'update', 
            json_object('result', OLD.result),
            json_object('result', NEW.result));
END;
```

---

## 📊 Zusammenfassung: Prioritäten für bessere Analyse

### 🔴 KRITISCH (Größter Analyse-Gewinn)

1. **Separate Ergebnis-Spalten** (home_score, guest_score)
   - Ermöglicht: Statistiken, Durchschnitte, Rekorde
   - Aufwand: 1 Stunde (Migration)

2. **Strukturierte Datums-Felder** (year, month, day_of_week)
   - Ermöglicht: Zeitreihen, Saisonvergleiche, Wochentag-Analyse
   - Aufwand: 1 Stunde (Migration)

3. **Team-Normalisierung** mit Stats
   - Ermöglicht: Team-Ranglisten, Regionen-Vergleiche
   - Aufwand: 2-3 Stunden (Migration + Frontend-Anpassung)

### 🟠 HOCH (Sehr nützlich)

4. **Spieler-Tabelle**
   - Ermöglicht: Karriere-Tracking, Spieler-Suche
   - Aufwand: 3-4 Stunden

5. **Materialized Views** für Stats
   - Ermöglicht: Schnelle Dashboards
   - Aufwand: 2 Stunden

### 🟡 MITTEL (Nice-to-have)

6. **Event-Analyse** (time_minutes, categories)
7. **Geografische Daten** (Lat/Lng)
8. **Full-Text Search**

### 🟢 NIEDRIG (Luxus)

9. **Changelog/Audit**
10. **Venue-Details** (Kapazität, etc.)

---

## 🚀 Schnell-Implementierung: Top 3

### Script: `enhance-analysis.sql`

```sql
-- 1. Ergebnis-Spalten
ALTER TABLE games ADD COLUMN home_score INTEGER;
ALTER TABLE games ADD COLUMN guest_score INTEGER;
ALTER TABLE games ADD COLUMN goal_difference INTEGER;
ALTER TABLE games ADD COLUMN total_goals INTEGER;

-- Migriere bestehende Daten
UPDATE games SET
    home_score = CAST(SUBSTR(result, 1, INSTR(result, ':') - 1) AS INTEGER),
    guest_score = CAST(SUBSTR(result, INSTR(result, ':') + 1) AS INTEGER)
WHERE result IS NOT NULL AND result != ' - ';

UPDATE games SET
    goal_difference = home_score - guest_score,
    total_goals = home_score + guest_score
WHERE home_score IS NOT NULL;

-- 2. Datums-Spalten
ALTER TABLE games ADD COLUMN start_year INTEGER;
ALTER TABLE games ADD COLUMN start_month INTEGER;
ALTER TABLE games ADD COLUMN start_day INTEGER;

-- Migriere (vereinfacht, besser mit Python/JS)
UPDATE games SET
    start_year = CAST('20' || SUBSTR(start_time, 7, 2) AS INTEGER)
WHERE start_time LIKE '%.%.%';

-- 3. Indizes für neue Spalten
CREATE INDEX idx_games_scores ON games(home_score, guest_score);
CREATE INDEX idx_games_date ON games(start_year, start_month);
CREATE INDEX idx_games_goal_diff ON games(goal_difference);

ANALYZE;
```

---

## 📈 Erwartete Verbesserungen

| Analyse-Art | Vorher | Nachher |
|-------------|--------|---------|
| **Tor-Statistiken** | ❌ Unmöglich | ✅ Einfache SQL-Queries |
| **Zeitreihen** | ⚠️ String-Parsing | ✅ Native Gruppierung |
| **Team-Vergleiche** | 🐌 Langsam | ⚡ Cached Stats |
| **Spieler-Karriere** | ❌ Nicht möglich | ✅ Player-Tabelle |
| **Dashboard-Daten** | 🐌 Jedes Mal berechnet | ⚡ Materialized Views |

---

## 💡 Empfehlung

**Starte mit den Ergebnis- und Datums-Spalten:**

```bash
# 1. Backup
cp src/assets/data/seasons.db src/assets/data/seasons.db.backup

# 2. Enhancement-Script ausführen
node scripts/enhance-analysis.js

# 3. Testen
npm run dev
```

Diese beiden Änderungen geben dir **80% des Analyse-Nutzens** mit minimalem Aufwand und **ohne Frontend-Änderungen**!

---

**Erstellt:** 5. Februar 2026  
**Für:** Erweiterte Datenanalyse-Möglichkeiten
