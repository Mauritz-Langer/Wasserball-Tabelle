# 🔬 Vollständige Atomare Daten-Migration

## Übersicht

Das Script `full-atomic-migration.js` führt eine **vollständige Transformation** der Datenbank durch, um alle Daten **atomar** (nicht weiter zerlegbar) zu speichern und die Datenbank für erweiterte Analysen zu optimieren.

**🔒 ACID-Compliant:** Das Script erfüllt alle ACID-Kriterien (Atomicity, Consistency, Isolation, Durability). Siehe [ACID_COMPLIANCE.md](./ACID_COMPLIANCE.md) für Details.

---

## 🎯 Was wird durchgeführt?

### 1. **Atomare Felder** ⚛️

Alle zusammengesetzten Felder werden in ihre atomaren Bestandteile zerlegt:

#### games.result: "27:5" → Atomare Felder
```sql
home_score INTEGER        -- 27
guest_score INTEGER       -- 5
goal_difference INTEGER   -- 2 (27-5)
total_goals INTEGER       -- 32 (27+5)
```

#### games.start_time: "04.10.25, 16:00 Uhr" → Atomare Felder
```sql
date_iso TEXT             -- "2025-10-04"
time_iso TEXT             -- "16:00"
datetime_iso TEXT         -- "2025-10-04T16:00:00"
start_year INTEGER        -- 2025
start_month INTEGER       -- 10
start_month_name TEXT     -- "Oktober"
start_day INTEGER         -- 4
start_hour INTEGER        -- 16
start_minute INTEGER      -- 0
start_day_of_week TEXT    -- "Samstag"
```

#### table_entries.goals: "123:45" → Atomare Felder
```sql
goals_for INTEGER         -- 123
goals_against INTEGER     -- 45
```

#### scorers.name: "Müller, Max (2005)" → Atomare Felder
```sql
player_name TEXT          -- "Müller, Max"
player_birth_year INTEGER -- 2005
```

### 2. **Normalisierung** 🏗️

Redundante Daten werden in eigene Tabellen ausgelagert:

#### Teams-Tabelle
```sql
CREATE TABLE teams (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    short_name TEXT,
    city TEXT,
    region TEXT
);

-- games.home_team (TEXT) → games.home_team_id (INTEGER → teams.id)
-- games.guest_team (TEXT) → games.guest_team_id (INTEGER → teams.id)
```

**Vorteil:** Team-Name "SSV Esslingen" nur 1x statt 718x gespeichert!

#### Venues-Tabelle
```sql
CREATE TABLE venues (
    id INTEGER PRIMARY KEY,
    pool_name TEXT,
    street TEXT,
    postal_code TEXT,
    city TEXT,
    full_address TEXT,
    google_maps_link TEXT
);

-- games.venue_id → venues.id
```

**Vorteil:** Adressen strukturiert, Lat/Lng kann hinzugefügt werden

#### Players-Tabelle
```sql
CREATE TABLE players (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    birth_year INTEGER,
    UNIQUE(name, birth_year)
);

-- scorers.player_id → players.id
-- game_lineups.player_id → players.id
```

**Vorteil:** Spieler-Karrieren über Saisons verfolgbar!

### 3. **Statistik-Tabellen** 📊

Vorberechnete Aggregationen für schnelle Dashboards:

```sql
CREATE TABLE team_season_stats (
    team_id INTEGER,
    season_id TEXT,
    games_played INTEGER,
    games_won INTEGER,
    goals_scored INTEGER,
    goals_conceded INTEGER,
    points INTEGER
);

CREATE TABLE league_stats (
    league_id TEXT,
    total_games INTEGER,
    total_goals INTEGER,
    avg_goals_per_game REAL,
    highest_score INTEGER
);
```

### 4. **Performance** ⚡

- 30+ Indizes für alle wichtigen Spalten
- Duplikate werden entfernt
- VACUUM & ANALYZE am Ende

**🔒 ACID-Garantien:**
- ✅ Foreign Keys aktiviert (Konsistenz)
- ✅ WAL-Mode (Write-Ahead Logging)
- ✅ Synchronous FULL (maximale Durabilität)
- ✅ Transaktionale Sicherheit (Atomarität)

---

## 🚀 Ausführung

### Einfache Ausführung

```bash
node scripts/full-atomic-migration.js
```

Das Script:
1. ✅ Erstellt automatisch Backup
2. ✅ Führt alle Transformationen in einer Transaktion durch
3. ✅ Bei Fehler: Automatischer Rollback + Backup-Wiederherstellung
4. ✅ Zeigt detaillierte Statistiken am Ende

### Dauer

- Kleine DB (< 100 MB): ~1-2 Minuten
- Mittlere DB (100-500 MB): ~3-5 Minuten
- Große DB (> 500 MB): ~5-10 Minuten

---

## 📊 Vorher/Nachher Vergleich

### Vorher (Nicht-Atomar)

```sql
-- Spiele finden mit mehr als 30 Toren?
-- ❌ UNMÖGLICH! result ist TEXT "27:5"
SELECT * FROM games WHERE ??? > 30;

-- Spiele im Oktober?
-- ⚠️ LANGSAM! String-Matching
SELECT * FROM games WHERE start_time LIKE '%10.%';

-- Team-Statistiken?
-- 🐌 SEHR LANGSAM! Gruppierung über TEXT
SELECT home_team, COUNT(*) FROM games GROUP BY home_team;
```

### Nachher (Atomar)

```sql
-- Spiele mit mehr als 30 Toren
-- ✅ EINFACH & SCHNELL!
SELECT * FROM games WHERE total_goals > 30;

-- Spiele im Oktober
-- ✅ SEHR SCHNELL! Index auf INTEGER
SELECT * FROM games WHERE start_month = 10;

-- Team-Statistiken
-- ✅ BLITZSCHNELL! Join über INTEGER + Index
SELECT t.name, COUNT(*) 
FROM teams t
JOIN games g ON g.home_team_id = t.id
GROUP BY t.id;

-- NEU: Spieler-Karriere über Saisons
SELECT p.name, SUM(s.goals) as total_goals
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
ORDER BY total_goals DESC;
```

---

## 🆕 Neue Analyse-Möglichkeiten

Nach der Migration kannst du ausführen:

```sql
-- 1. Torreichste Spiele
SELECT t1.name as home, t2.name as guest, g.total_goals, g.date_iso
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE g.total_goals IS NOT NULL
ORDER BY g.total_goals DESC
LIMIT 10;

-- 2. Knappste Spiele (Differenz ≤ 1)
SELECT t1.name, t2.name, g.home_score, g.guest_score
FROM games g
JOIN teams t1 ON g.home_team_id = t1.id
JOIN teams t2 ON g.guest_team_id = t2.id
WHERE ABS(g.goal_difference) <= 1;

-- 3. Spiele nach Wochentag
SELECT start_day_of_week, COUNT(*) as count
FROM games
WHERE start_day_of_week IS NOT NULL
GROUP BY start_day_of_week
ORDER BY count DESC;

-- 4. Durchschnittliche Tore pro Monat
SELECT start_month_name, AVG(total_goals) as avg_goals
FROM games
WHERE total_goals IS NOT NULL
GROUP BY start_month
ORDER BY start_month;

-- 5. Top Scorer aller Zeiten
SELECT p.name, p.birth_year, SUM(s.goals) as career_goals
FROM players p
JOIN scorers s ON s.player_id = p.id
GROUP BY p.id
ORDER BY career_goals DESC
LIMIT 10;

-- 6. Team-Heimstärke
SELECT t.name,
       COUNT(*) as home_games,
       SUM(CASE WHEN g.home_score > g.guest_score THEN 1 ELSE 0 END) as wins,
       ROUND(100.0 * SUM(CASE WHEN g.home_score > g.guest_score THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate
FROM teams t
JOIN games g ON g.home_team_id = t.id
WHERE g.home_score IS NOT NULL
GROUP BY t.id
HAVING home_games >= 10
ORDER BY win_rate DESC
LIMIT 10;

-- 7. Torreichste Uhrzeiten
SELECT start_hour, AVG(total_goals) as avg_goals, COUNT(*) as games
FROM games
WHERE start_hour IS NOT NULL AND total_goals IS NOT NULL
GROUP BY start_hour
ORDER BY avg_goals DESC;

-- 8. Spielorte mit meisten Spielen
SELECT v.pool_name, v.city, COUNT(*) as games
FROM venues v
JOIN games g ON g.venue_id = v.id
GROUP BY v.id
ORDER BY games DESC
LIMIT 10;
```

---

## ⚙️ Konfiguration

Das Script kann über die `CONFIG` Variable angepasst werden:

```javascript
const CONFIG = {
    createBackup: true,        // Backup vor Migration
    addIndexes: true,          // Performance-Indizes
    atomizeFields: true,       // Atomare Felder hinzufügen
    normalizeTeams: true,      // Teams-Tabelle erstellen
    normalizePlayers: true,    // Players-Tabelle erstellen
    normalizeVenues: true,     // Venues-Tabelle erstellen
    createStats: true,         // Statistik-Tabellen
    cleanupDuplicates: true,   // Duplikate entfernen
    vacuum: true               // DB optimieren
};
```

Einzelne Features können deaktiviert werden durch `false`.

---

## 📈 Erwartete Verbesserungen

| Metrik | Vorher | Nachher | Faktor |
|--------|--------|---------|--------|
| **Query-Speed (Liga laden)** | 500ms | 10ms | **50x schneller** |
| **Query-Speed (Statistiken)** | 2000ms | 20ms | **100x schneller** |
| **Speicher (nach Team-Norm)** | 501 MB | ~430 MB | **-15%** |
| **Analyse-Möglichkeiten** | Begrenzt | Unbegrenzt | **∞** |
| **Datenintegrität** | Mittel | Hoch | **Constraints** |

---

## ⚠️ Wichtige Hinweise

### 1. Alte Spalten bleiben erhalten

Die alten Spalten (z.B. `result`, `start_time`, `home_team`) bleiben vorhanden!

**Warum?** Für Abwärtskompatibilität und Verifikation.

**Nach Verifikation** kannst du sie optional entfernen:

```sql
ALTER TABLE games DROP COLUMN result;
ALTER TABLE games DROP COLUMN start_time;
ALTER TABLE games DROP COLUMN home_team;
ALTER TABLE games DROP COLUMN guest_team;
-- etc.

VACUUM; -- Speicher freigeben
```

### 2. Frontend-Anpassungen

Das Frontend muss **nicht** sofort angepasst werden, da alte Spalten bleiben.

**Optional:** Queries umstellen für bessere Performance:

```typescript
// Vorher
const games = db.query('SELECT * FROM games WHERE league_id = ?', [leagueId]);

// Nachher (mit Teams)
const games = db.query(`
  SELECT g.*, t1.name as home_team_name, t2.name as guest_team_name
  FROM games g
  LEFT JOIN teams t1 ON g.home_team_id = t1.id
  LEFT JOIN teams t2 ON g.guest_team_id = t2.id
  WHERE g.league_id = ?
`, [leagueId]);
```

### 3. Neue Daten

Aktualisiere `scrape-seasons.js`, damit neue Daten bereits atomar gespeichert werden:

Die Helper-Funktionen sind bereits vorhanden!

---

## 🔍 Verifikation

Nach der Migration prüfen:

```bash
# 1. App starten
npm run dev

# 2. Datenbank-Konsole
sqlite3 src/assets/data/seasons.db

# 3. Prüfungen
.tables
SELECT COUNT(*) FROM teams;
SELECT COUNT(*) FROM players;
SELECT COUNT(*) FROM venues;

# 4. Atomare Felder prüfen
SELECT COUNT(*) FROM games WHERE home_score IS NOT NULL;
SELECT COUNT(*) FROM games WHERE datetime_iso IS NOT NULL;

# 5. Beispiel-Query
SELECT * FROM games WHERE total_goals > 30 LIMIT 5;
```

---

## 🆘 Troubleshooting

### Problem: Migration schlägt fehl

**Lösung:** Backup wird automatisch wiederhergestellt!

```bash
# Manuell wiederherstellen:
cp src/assets/data/seasons.db.backup.[timestamp] src/assets/data/seasons.db
```

### Problem: Alte Queries funktionieren nicht mehr

Das sollte **nicht** passieren, da alte Spalten bleiben!

Falls doch:
1. Prüfe welche Spalte fehlt
2. Passe Query an oder nutze alte Spalte

### Problem: Zu langsam

Bei sehr großen Datenbanken:

```javascript
// CONFIG anpassen:
const CONFIG = {
    // ... nur wichtigste Features
    atomizeFields: true,
    addIndexes: true,
    normalizeTeams: false,  // Später
    normalizePlayers: false, // Später
    normalizeVenues: false,  // Später
};
```

Normalisierung in separaten Schritten durchführen.

---

## 📚 Verwandte Dokumentation

- **DB_OPTIMIZATION_REPORT.md** - Performance-Details
- **DB_ADVANCED_IMPROVEMENTS.md** - Alle möglichen Verbesserungen
- **DB_ANALYSIS_SUMMARY.md** - Übersicht

---

## ✅ Checkliste

Vor Migration:
- [ ] Backup vorhanden (wird automatisch erstellt)
- [ ] Genug Festplattenspeicher (~2x DB-Größe)
- [ ] Zeit eingeplant (5-10 Minuten)

Nach Migration:
- [ ] App getestet (`npm run dev`)
- [ ] Beispiel-Queries ausgeführt
- [ ] Performance verglichen
- [ ] Frontend optional angepasst
- [ ] Alte Spalten optional entfernt
- [ ] Backup gelöscht (nach erfolgreicher Verifikation)

---

## 🎉 Zusammenfassung

Das `full-atomic-migration.js` Script:

✅ **Macht Daten atomar** - Jedes Feld enthält nur einen Wert  
✅ **Normalisiert Redundanzen** - Teams, Players, Venues  
✅ **Optimiert Performance** - 30+ Indizes  
✅ **Ermöglicht Analysen** - Statistiken, Trends, Rankings  
✅ **Sicher** - Automatisches Backup & Rollback  
✅ **Flexibel** - Konfigurierbar  

**Empfehlung:** Jetzt ausführen für maximale Analyse-Power! 🚀

---

**Erstellt:** 5. Februar 2026  
**Version:** 1.0  
**Getestet mit:** SQLite 3.x, Node.js 20.x
