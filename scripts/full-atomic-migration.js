#!/usr/bin/env node

/**
 * Vollständige Atomare Daten-Migration
 *
 * Führt ALLE identifizierten Verbesserungen durch:
 * 1. Performance: Indizes, Duplikate entfernen
 * 2. Atomare Felder: Scores, Datumsangaben, Namen
 * 3. Normalisierung: Teams, Venues, Players
 * 4. Materialized Views: Statistiken
 *
 * WICHTIG: Erstellt automatisch Backup vor jeder Änderung!
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../src/assets/data/seasons.db');
const BACKUP_PATH = path.join(__dirname, `../src/assets/data/seasons.db.backup.${Date.now()}`);

// Konfiguration
const CONFIG = {
    createBackup: true,
    addIndexes: true,
    atomizeFields: true,
    normalizeTeams: true,
    normalizePlayers: true,
    normalizeVenues: true,
    createStats: true,
    cleanupDuplicates: true,
    vacuum: true
};

console.log('🏊 VOLLSTÄNDIGE ATOMARE DATEN-MIGRATION');
console.log('='.repeat(80));
console.log('');
console.log('Diese Migration wird durchführen:');
console.log('  ✓ Backup erstellen');
console.log('  ✓ Atomare Felder hinzufügen (Scores, Datumsangaben)');
console.log('  ✓ Normalisierung (Teams, Venues, Players)');
console.log('  ✓ Performance-Indizes');
console.log('  ✓ Duplikate entfernen');
console.log('  ✓ Statistik-Tabellen');
console.log('  ✓ Database optimieren');
console.log('');

// Backup erstellen
if (CONFIG.createBackup) {
    console.log('📦 Step 1: Creating Backup...');
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
    const backupSizeMB = (fs.statSync(BACKUP_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`   ✅ Backup created: ${BACKUP_PATH} (${backupSizeMB} MB)`);
    console.log('');
}

const db = new Database(DB_PATH);

// ================================================================
// ACID-COMPLIANCE: SQLite Optimierungen
// ================================================================

console.log('🔒 Configuring ACID-Compliant Database Settings...');

// CONSISTENCY: Foreign Keys aktivieren (standardmäßig OFF in SQLite!)
db.pragma('foreign_keys = ON');

// DURABILITY: Write-Ahead Logging für bessere Performance + Sicherheit
db.pragma('journal_mode = WAL');

// DURABILITY: Synchronous für maximale Sicherheit
// FULL = maximale Sicherheit (etwas langsamer)
// NORMAL = guter Kompromiss (empfohlen)
db.pragma('synchronous = FULL');

// ISOLATION: Busy Timeout für Concurrent Access
db.pragma('busy_timeout = 5000'); // 5 Sekunden

// Performance + Sicherheit
db.pragma('cache_size = -64000'); // 64MB Cache
db.pragma('temp_store = MEMORY'); // Temp-Tabellen im RAM

console.log('   ✅ Foreign Keys: ENABLED');
console.log('   ✅ Journal Mode: WAL (Write-Ahead Logging)');
console.log('   ✅ Synchronous: FULL (maximale Durability)');
console.log('   ✅ Busy Timeout: 5000ms');
console.log('');

// Helper Funktionen
const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const monthNames = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function parseScore(resultString) {
    if (!resultString || resultString.trim() === '' || resultString.trim() === '-' || resultString.trim() === ' - ') {
        return { home: null, guest: null };
    }
    try {
        const [homeStr, guestStr] = resultString.split(':');
        const home = parseInt(homeStr?.trim());
        const guest = parseInt(guestStr?.trim());
        if (!isNaN(home) && !isNaN(guest)) {
            return { home, guest };
        }
    } catch (e) {}
    return { home: null, guest: null };
}

function parseDateTime(dateTimeString) {
    if (!dateTimeString) return null;
    try {
        const match = dateTimeString.match(/(\d{2})\.(\d{2})\.(\d{2,4})[,\s]+(\d{1,2}):(\d{2})/);
        if (match) {
            const [, day, month, yearShort, hour, minute] = match;
            const year = yearShort.length === 2 ? 2000 + parseInt(yearShort) : parseInt(yearShort);
            const date = new Date(year, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            return {
                year,
                month: parseInt(month),
                day: parseInt(day),
                hour: parseInt(hour),
                minute: parseInt(minute),
                dayOfWeek: dayNames[date.getDay()],
                date: date.toISOString().split('T')[0],
                time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                datetime: date.toISOString()
            };
        }
    } catch (e) {}
    return null;
}

function parsePlayerName(nameString) {
    // Format: "Müller, Max (2005)" -> name: "Müller, Max", birthYear: 2005
    if (!nameString) return { name: nameString, birthYear: null };
    const match = nameString.match(/^(.+?)\s*\((\d{4})\)\s*$/);
    if (match) {
        return { name: match[1].trim(), birthYear: parseInt(match[2]) };
    }
    return { name: nameString, birthYear: null };
}

function parseGoals(goalsString) {
    // Format: "123:45" -> goalsFor: 123, goalsAgainst: 45
    if (!goalsString) return { goalsFor: null, goalsAgainst: null };
    try {
        const [forStr, againstStr] = goalsString.split(':');
        const goalsFor = parseInt(forStr?.trim());
        const goalsAgainst = parseInt(againstStr?.trim());
        if (!isNaN(goalsFor) && !isNaN(goalsAgainst)) {
            return { goalsFor, goalsAgainst };
        }
    } catch (e) {}
    return { goalsFor: null, goalsAgainst: null };
}

function extractAddress(addressString) {
    // Format: "Straße 11, 10829 Berlin" -> street, postalCode, city
    if (!addressString) return { street: null, postalCode: null, city: null };
    try {
        const match = addressString.match(/^(.+?),\s*(\d{5})\s+(.+)$/);
        if (match) {
            return { street: match[1].trim(), postalCode: match[2], city: match[3].trim() };
        }
        // Fallback: Nur Stadt
        return { street: null, postalCode: null, city: addressString.trim() };
    } catch (e) {}
    return { street: null, postalCode: null, city: addressString };
}

let migrationStats = {
    gamesUpdated: 0,
    teamsCreated: 0,
    playersCreated: 0,
    venuesCreated: 0,
    indexesCreated: 0,
    duplicatesRemoved: 0,
    errors: []
};

try {
    db.transaction(() => {

        // ================================================================
        // STEP 2: ATOMARE FELDER HINZUFÜGEN
        // ================================================================

        if (CONFIG.atomizeFields) {
            console.log('⚛️  Step 2: Adding Atomic Fields...');
            console.log('-'.repeat(80));

            // Prüfe existierende Spalten
            const columns = db.prepare("PRAGMA table_info(games)").all();
            const existingCols = new Set(columns.map(c => c.name));

            // 2.1 Games: Scores
            console.log('   2.1 Games: Score fields...');
            if (!existingCols.has('home_score')) {
                db.exec(`
                    ALTER TABLE games ADD COLUMN home_score INTEGER CHECK(home_score >= 0);
                    ALTER TABLE games ADD COLUMN guest_score INTEGER CHECK(guest_score >= 0);
                    ALTER TABLE games ADD COLUMN goal_difference INTEGER;
                    ALTER TABLE games ADD COLUMN total_goals INTEGER CHECK(total_goals >= 0);
                `);
            }

            // 2.2 Games: Datum-Komponenten
            console.log('   2.2 Games: Date/Time components...');
            if (!existingCols.has('date_iso')) {
                db.exec(`
                    ALTER TABLE games ADD COLUMN date_iso TEXT;
                    ALTER TABLE games ADD COLUMN time_iso TEXT;
                    ALTER TABLE games ADD COLUMN datetime_iso TEXT;
                    ALTER TABLE games ADD COLUMN start_year INTEGER CHECK(start_year >= 2000 AND start_year <= 2100);
                    ALTER TABLE games ADD COLUMN start_month INTEGER CHECK(start_month >= 1 AND start_month <= 12);
                    ALTER TABLE games ADD COLUMN start_month_name TEXT;
                    ALTER TABLE games ADD COLUMN start_day INTEGER CHECK(start_day >= 1 AND start_day <= 31);
                    ALTER TABLE games ADD COLUMN start_hour INTEGER CHECK(start_hour >= 0 AND start_hour <= 23);
                    ALTER TABLE games ADD COLUMN start_minute INTEGER CHECK(start_minute >= 0 AND start_minute <= 59);
                    ALTER TABLE games ADD COLUMN start_day_of_week TEXT;
                `);
            }

            // 2.3 Table Entries: Goals aufteilen
            console.log('   2.3 Table Entries: Goals split...');
            const tableEntryCols = db.prepare("PRAGMA table_info(table_entries)").all();
            const tableCols = new Set(tableEntryCols.map(c => c.name));
            if (!tableCols.has('goals_for')) {
                db.exec(`
                    ALTER TABLE table_entries ADD COLUMN goals_for INTEGER;
                    ALTER TABLE table_entries ADD COLUMN goals_against INTEGER;
                `);
            }

            // 2.4 Scorers: Name und Geburtsjahr trennen
            console.log('   2.4 Scorers: Separate name and birth year...');
            const scorerCols = db.prepare("PRAGMA table_info(scorers)").all();
            const scorerColSet = new Set(scorerCols.map(c => c.name));
            if (!scorerColSet.has('player_name')) {
                db.exec(`
                    ALTER TABLE scorers ADD COLUMN player_name TEXT;
                    ALTER TABLE scorers ADD COLUMN player_birth_year INTEGER;
                `);
            }

            console.log('   ✅ Atomic fields added');
            console.log('');
        }

        // ================================================================
        // STEP 3: DATEN MIGRIEREN
        // ================================================================

        if (CONFIG.atomizeFields) {
            console.log('🔄 Step 3: Migrating Data to Atomic Fields...');
            console.log('-'.repeat(80));

            // 3.1 Games: Scores parsen
            console.log('   3.1 Parsing scores...');
            const gamesToParse = db.prepare(`
                SELECT id, result
                FROM games
                WHERE result IS NOT NULL
                  AND result != ' - '
                  AND home_score IS NULL
            `).all();

            const updateGameScore = db.prepare(`
                UPDATE games SET
                    home_score = ?,
                    guest_score = ?,
                    goal_difference = ?,
                    total_goals = ?
                WHERE id = ?
            `);

            let scoresParsed = 0;
            for (const game of gamesToParse) {
                const { home, guest } = parseScore(game.result);
                if (home !== null && guest !== null) {
                    updateGameScore.run(home, guest, home - guest, home + guest, game.id);
                    scoresParsed++;
                }
            }
            console.log(`       ✓ Parsed ${scoresParsed} scores`);

            // 3.2 Games: Datumsangaben parsen
            console.log('   3.2 Parsing dates/times...');
            const gamesToParseDate = db.prepare(`
                SELECT id, start_time
                FROM games
                WHERE start_time IS NOT NULL
                  AND datetime_iso IS NULL
            `).all();

            const updateGameDate = db.prepare(`
                UPDATE games SET
                    date_iso = ?,
                    time_iso = ?,
                    datetime_iso = ?,
                    start_year = ?,
                    start_month = ?,
                    start_month_name = ?,
                    start_day = ?,
                    start_hour = ?,
                    start_minute = ?,
                    start_day_of_week = ?
                WHERE id = ?
            `);

            let datesParsed = 0;
            for (const game of gamesToParseDate) {
                const dateData = parseDateTime(game.start_time);
                if (dateData) {
                    updateGameDate.run(
                        dateData.date,
                        dateData.time,
                        dateData.datetime,
                        dateData.year,
                        dateData.month,
                        monthNames[dateData.month],
                        dateData.day,
                        dateData.hour,
                        dateData.minute,
                        dateData.dayOfWeek,
                        game.id
                    );
                    datesParsed++;
                }
            }
            console.log(`       ✓ Parsed ${datesParsed} dates`);

            // 3.3 Table Entries: Goals parsen
            console.log('   3.3 Parsing table entry goals...');
            const tablesToParse = db.prepare(`
                SELECT id, goals
                FROM table_entries
                WHERE goals IS NOT NULL
                  AND goals_for IS NULL
            `).all();

            const updateTableGoals = db.prepare(`
                UPDATE table_entries SET
                    goals_for = ?,
                    goals_against = ?
                WHERE id = ?
            `);

            let tableGoalsParsed = 0;
            for (const entry of tablesToParse) {
                const { goalsFor, goalsAgainst } = parseGoals(entry.goals);
                if (goalsFor !== null && goalsAgainst !== null) {
                    updateTableGoals.run(goalsFor, goalsAgainst, entry.id);
                    tableGoalsParsed++;
                }
            }
            console.log(`       ✓ Parsed ${tableGoalsParsed} table goals`);

            // 3.4 Scorers: Namen parsen
            console.log('   3.4 Parsing player names...');
            const scorersToParse = db.prepare(`
                SELECT id, name
                FROM scorers
                WHERE name IS NOT NULL
                  AND player_name IS NULL
            `).all();

            const updateScorerName = db.prepare(`
                UPDATE scorers SET
                    player_name = ?,
                    player_birth_year = ?
                WHERE id = ?
            `);

            let namesParsed = 0;
            for (const scorer of scorersToParse) {
                const { name, birthYear } = parsePlayerName(scorer.name);
                updateScorerName.run(name, birthYear, scorer.id);
                namesParsed++;
            }
            console.log(`       ✓ Parsed ${namesParsed} player names`);

            migrationStats.gamesUpdated = scoresParsed + datesParsed;
            console.log('   ✅ Data migration completed');
            console.log('');
        }

        // ================================================================
        // STEP 4: NORMALISIERUNG - TEAMS
        // ================================================================

        if (CONFIG.normalizeTeams) {
            console.log('🏢 Step 4: Normalizing Teams...');
            console.log('-'.repeat(80));

            // 4.1 Teams Tabelle erstellen
            db.exec(`
                CREATE TABLE IF NOT EXISTS teams (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    short_name TEXT,
                    city TEXT,
                    region TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 4.2 Einzigartige Teams extrahieren
            console.log('   4.1 Extracting unique teams...');
            const teams = new Set();

            const homeTeams = db.prepare('SELECT DISTINCT TRIM(home_team) as team FROM games WHERE home_team IS NOT NULL').all();
            const guestTeams = db.prepare('SELECT DISTINCT TRIM(guest_team) as team FROM games WHERE guest_team IS NOT NULL').all();

            homeTeams.forEach(row => teams.add(row.team));
            guestTeams.forEach(row => teams.add(row.team));

            console.log(`       Found ${teams.size} unique teams`);

            // 4.3 Teams einfügen
            console.log('   4.2 Inserting teams...');
            const insertTeam = db.prepare('INSERT OR IGNORE INTO teams (name) VALUES (?)');

            let teamsInserted = 0;
            for (const team of teams) {
                const result = insertTeam.run(team);
                if (result.changes > 0) teamsInserted++;
            }
            migrationStats.teamsCreated = teamsInserted;
            console.log(`       ✓ Inserted ${teamsInserted} teams`);

            // 4.4 Foreign Keys zu games
            const gameCols = db.prepare("PRAGMA table_info(games)").all();
            const gameColSet = new Set(gameCols.map(c => c.name));

            if (!gameColSet.has('home_team_id')) {
                console.log('   4.3 Adding foreign key columns...');
                db.exec(`
                    ALTER TABLE games ADD COLUMN home_team_id INTEGER REFERENCES teams(id);
                    ALTER TABLE games ADD COLUMN guest_team_id INTEGER REFERENCES teams(id);
                `);
            }

            // 4.5 IDs aktualisieren
            console.log('   4.4 Linking teams to games...');
            db.exec(`
                UPDATE games SET
                    home_team_id = (SELECT id FROM teams WHERE name = TRIM(games.home_team))
                WHERE home_team IS NOT NULL AND home_team_id IS NULL;

                UPDATE games SET
                    guest_team_id = (SELECT id FROM teams WHERE name = TRIM(games.guest_team))
                WHERE guest_team IS NOT NULL AND guest_team_id IS NULL;
            `);

            // Validierung
            const unmapped = db.prepare(`
                SELECT COUNT(*) as c
                FROM games
                WHERE (home_team IS NOT NULL AND home_team_id IS NULL)
                   OR (guest_team IS NOT NULL AND guest_team_id IS NULL)
            `).get();

            if (unmapped.c > 0) {
                console.log(`       ⚠️  Warning: ${unmapped.c} games not fully mapped`);
            } else {
                console.log('       ✓ All games mapped to teams');
            }

            console.log('   ✅ Team normalization completed');
            console.log('');
        }

        // ================================================================
        // STEP 5: NORMALISIERUNG - VENUES
        // ================================================================

        if (CONFIG.normalizeVenues) {
            console.log('🏊 Step 5: Normalizing Venues...');
            console.log('-'.repeat(80));

            // 5.1 Venues Tabelle erstellen
            db.exec(`
                CREATE TABLE IF NOT EXISTS venues (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pool_name TEXT,
                    street TEXT,
                    postal_code TEXT,
                    city TEXT,
                    full_address TEXT,
                    google_maps_link TEXT,
                    UNIQUE(pool_name, city)
                );
            `);

            // 5.2 Einzigartige Venues extrahieren
            console.log('   5.1 Extracting unique venues...');
            const venueData = db.prepare(`
                SELECT DISTINCT
                    pool_name,
                    pool_city,
                    google_maps_link
                FROM games
                WHERE pool_name IS NOT NULL
            `).all();

            const insertVenue = db.prepare(`
                INSERT OR IGNORE INTO venues (pool_name, street, postal_code, city, full_address, google_maps_link)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            let venuesInserted = 0;
            for (const venue of venueData) {
                const addr = extractAddress(venue.pool_city);
                const result = insertVenue.run(
                    venue.pool_name,
                    addr.street,
                    addr.postalCode,
                    addr.city,
                    venue.pool_city,
                    venue.google_maps_link
                );
                if (result.changes > 0) venuesInserted++;
            }
            migrationStats.venuesCreated = venuesInserted;
            console.log(`       ✓ Inserted ${venuesInserted} venues`);

            // 5.3 Foreign Key zu games
            const gameColsVenue = db.prepare("PRAGMA table_info(games)").all();
            const gameColSetVenue = new Set(gameColsVenue.map(c => c.name));

            if (!gameColSetVenue.has('venue_id')) {
                console.log('   5.2 Adding venue foreign key...');
                db.exec(`ALTER TABLE games ADD COLUMN venue_id INTEGER REFERENCES venues(id);`);
            }

            // 5.4 IDs aktualisieren
            console.log('   5.3 Linking venues to games...');
            db.exec(`
                UPDATE games SET
                    venue_id = (
                        SELECT id FROM venues
                        WHERE pool_name = games.pool_name
                          AND city = (
                              SELECT city FROM venues v2
                              WHERE v2.pool_name = games.pool_name
                              LIMIT 1
                          )
                        LIMIT 1
                    )
                WHERE pool_name IS NOT NULL AND venue_id IS NULL;
            `);

            console.log('   ✅ Venue normalization completed');
            console.log('');
        }

        // ================================================================
        // STEP 6: NORMALISIERUNG - PLAYERS
        // ================================================================

        if (CONFIG.normalizePlayers) {
            console.log('👤 Step 6: Normalizing Players...');
            console.log('-'.repeat(80));

            // 6.1 Players Tabelle erstellen
            db.exec(`
                CREATE TABLE IF NOT EXISTS players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    birth_year INTEGER,
                    UNIQUE(name, birth_year)
                );
            `);

            // 6.2 Spieler aus scorers extrahieren
            console.log('   6.1 Extracting players from scorers...');
            const playersFromScorers = db.prepare(`
                SELECT DISTINCT player_name, player_birth_year
                FROM scorers
                WHERE player_name IS NOT NULL
            `).all();

            const insertPlayer = db.prepare(`
                INSERT OR IGNORE INTO players (name, birth_year)
                VALUES (?, ?)
            `);

            let playersInserted = 0;
            for (const player of playersFromScorers) {
                const result = insertPlayer.run(player.player_name, player.player_birth_year);
                if (result.changes > 0) playersInserted++;
            }

            // 6.3 Spieler aus lineups extrahieren
            console.log('   6.2 Extracting players from lineups...');
            const playersFromLineups = db.prepare(`
                SELECT DISTINCT name, birth_year
                FROM game_lineups
                WHERE name IS NOT NULL
            `).all();

            for (const player of playersFromLineups) {
                const result = insertPlayer.run(player.name, player.birth_year || null);
                if (result.changes > 0) playersInserted++;
            }

            migrationStats.playersCreated = playersInserted;
            console.log(`       ✓ Inserted ${playersInserted} players`);

            // 6.4 Foreign Keys
            console.log('   6.3 Adding player foreign keys...');
            const scorerColsCheck = db.prepare("PRAGMA table_info(scorers)").all();
            const scorerColNames = new Set(scorerColsCheck.map(c => c.name));

            if (!scorerColNames.has('player_id')) {
                db.exec(`ALTER TABLE scorers ADD COLUMN player_id INTEGER REFERENCES players(id);`);
            }

            const lineupColsCheck = db.prepare("PRAGMA table_info(game_lineups)").all();
            const lineupColNames = new Set(lineupColsCheck.map(c => c.name));

            if (!lineupColNames.has('player_id')) {
                db.exec(`ALTER TABLE game_lineups ADD COLUMN player_id INTEGER REFERENCES players(id);`);
            }

            // 6.5 IDs aktualisieren
            console.log('   6.4 Linking players...');
            db.exec(`
                UPDATE scorers SET
                    player_id = (
                        SELECT id FROM players
                        WHERE name = scorers.player_name
                          AND (birth_year = scorers.player_birth_year OR (birth_year IS NULL AND scorers.player_birth_year IS NULL))
                        LIMIT 1
                    )
                WHERE player_name IS NOT NULL AND player_id IS NULL;

                UPDATE game_lineups SET
                    player_id = (
                        SELECT id FROM players
                        WHERE name = game_lineups.name
                          AND (birth_year = game_lineups.birth_year OR birth_year IS NULL)
                        LIMIT 1
                    )
                WHERE name IS NOT NULL AND player_id IS NULL;
            `);

            console.log('   ✅ Player normalization completed');
            console.log('');
        }

        // ================================================================
        // STEP 7: DUPLIKATE ENTFERNEN
        // ================================================================

        if (CONFIG.cleanupDuplicates) {
            console.log('🧹 Step 7: Removing Duplicates...');
            console.log('-'.repeat(80));

            // Scorers Duplikate
            console.log('   7.1 Removing scorer duplicates...');
            const scorerDupsBefore = db.prepare(`
                SELECT COUNT(*) - COUNT(DISTINCT league_id || player_name || team) as dups
                FROM scorers
            `).get();

            db.exec(`
                DELETE FROM scorers
                WHERE rowid NOT IN (
                    SELECT MAX(rowid)
                    FROM scorers
                    GROUP BY league_id, player_name, team
                );
            `);

            const scorerDupsRemoved = scorerDupsBefore.dups;
            migrationStats.duplicatesRemoved += scorerDupsRemoved;
            console.log(`       ✓ Removed ${scorerDupsRemoved} duplicate scorers`);

            console.log('   ✅ Duplicates removed');
            console.log('');
        }

        // ================================================================
        // STEP 8: STATISTIK-TABELLEN
        // ================================================================

        if (CONFIG.createStats) {
            console.log('📊 Step 8: Creating Statistics Tables...');
            console.log('-'.repeat(80));

            // 8.1 Team Season Stats
            console.log('   8.1 Creating team_season_stats...');
            db.exec(`
                CREATE TABLE IF NOT EXISTS team_season_stats (
                    id TEXT PRIMARY KEY,
                    team_id INTEGER REFERENCES teams(id),
                    season_id TEXT REFERENCES seasons(id),

                    games_played INTEGER DEFAULT 0,
                    games_won INTEGER DEFAULT 0,
                    games_drawn INTEGER DEFAULT 0,
                    games_lost INTEGER DEFAULT 0,

                    home_games INTEGER DEFAULT 0,
                    home_wins INTEGER DEFAULT 0,
                    away_games INTEGER DEFAULT 0,
                    away_wins INTEGER DEFAULT 0,

                    goals_scored INTEGER DEFAULT 0,
                    goals_conceded INTEGER DEFAULT 0,
                    goal_difference INTEGER DEFAULT 0,

                    points INTEGER DEFAULT 0,

                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 8.2 League Stats
            console.log('   8.2 Creating league_stats...');
            db.exec(`
                CREATE TABLE IF NOT EXISTS league_stats (
                    league_id TEXT PRIMARY KEY,
                    season_id TEXT REFERENCES seasons(id),

                    total_games INTEGER DEFAULT 0,
                    finished_games INTEGER DEFAULT 0,
                    total_goals INTEGER DEFAULT 0,
                    avg_goals_per_game REAL,

                    highest_score INTEGER,
                    most_goals_game_id TEXT,

                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Statistiken berechnen
            console.log('   8.3 Calculating league statistics...');
            db.exec(`
                INSERT OR REPLACE INTO league_stats (league_id, season_id, total_games, finished_games, total_goals, avg_goals_per_game)
                SELECT
                    l.id as league_id,
                    l.season_id,
                    COUNT(g.id) as total_games,
                    COUNT(CASE WHEN g.result IS NOT NULL AND g.result != ' - ' THEN 1 END) as finished_games,
                    COALESCE(SUM(g.total_goals), 0) as total_goals,
                    COALESCE(AVG(g.total_goals), 0) as avg_goals_per_game
                FROM leagues l
                LEFT JOIN games g ON g.league_id = l.id
                GROUP BY l.id;
            `);

            console.log('   ✅ Statistics tables created');
            console.log('');
        }

        // ================================================================
        // STEP 9: INDIZES
        // ================================================================

        if (CONFIG.addIndexes) {
            console.log('🔧 Step 9: Creating Performance Indexes...');
            console.log('-'.repeat(80));

            const indexes = [
                // Games
                'CREATE INDEX IF NOT EXISTS idx_games_league_id ON games(league_id)',
                'CREATE INDEX IF NOT EXISTS idx_games_home_team_id ON games(home_team_id)',
                'CREATE INDEX IF NOT EXISTS idx_games_guest_team_id ON games(guest_team_id)',
                'CREATE INDEX IF NOT EXISTS idx_games_venue_id ON games(venue_id)',
                'CREATE INDEX IF NOT EXISTS idx_games_date ON games(date_iso)',
                'CREATE INDEX IF NOT EXISTS idx_games_year_month ON games(start_year, start_month)',
                'CREATE INDEX IF NOT EXISTS idx_games_scores ON games(home_score, guest_score)',
                'CREATE INDEX IF NOT EXISTS idx_games_total_goals ON games(total_goals DESC)',

                // Teams
                'CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name)',

                // Venues
                'CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city)',

                // Players
                'CREATE INDEX IF NOT EXISTS idx_players_name ON players(name)',
                'CREATE INDEX IF NOT EXISTS idx_players_birth_year ON players(birth_year)',

                // Scorers
                'CREATE INDEX IF NOT EXISTS idx_scorers_league_id ON scorers(league_id)',
                'CREATE INDEX IF NOT EXISTS idx_scorers_player_id ON scorers(player_id)',
                'CREATE INDEX IF NOT EXISTS idx_scorers_goals ON scorers(goals DESC)',

                // Table Entries
                'CREATE INDEX IF NOT EXISTS idx_table_entries_league_id ON table_entries(league_id)',

                // Leagues
                'CREATE INDEX IF NOT EXISTS idx_leagues_season_id ON leagues(season_id)',

                // Game Details
                'CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id)',
                'CREATE INDEX IF NOT EXISTS idx_game_lineups_game_id ON game_lineups(game_id)',
                'CREATE INDEX IF NOT EXISTS idx_game_lineups_player_id ON game_lineups(player_id)',
                'CREATE INDEX IF NOT EXISTS idx_game_quarter_scores_game_id ON game_quarter_scores(game_id)',
                'CREATE INDEX IF NOT EXISTS idx_game_officials_game_id ON game_officials(game_id)',
                'CREATE INDEX IF NOT EXISTS idx_game_team_details_game_id ON game_team_details(game_id)',

                // Stats
                'CREATE INDEX IF NOT EXISTS idx_team_season_stats_team ON team_season_stats(team_id)',
                'CREATE INDEX IF NOT EXISTS idx_league_stats_season ON league_stats(season_id)'
            ];

            for (const indexSql of indexes) {
                db.exec(indexSql);
                migrationStats.indexesCreated++;
            }

            console.log(`   ✓ Created ${migrationStats.indexesCreated} indexes`);
            console.log('   ✅ Indexes created');
            console.log('');
        }

        // ================================================================
        // STEP 10: ANALYZE (VACUUM muss außerhalb der Transaktion)
        // ================================================================

        console.log('🔬 Step 10: Running ANALYZE...');
        console.log('-'.repeat(80));

        db.exec('ANALYZE');

        console.log('   ✅ ANALYZE completed');
        console.log('');

    })();

    // ================================================================
    // VACUUM (außerhalb der Transaktion)
    // ================================================================

    if (CONFIG.vacuum) {
        console.log('🔬 Step 11: Running VACUUM...');
        console.log('-'.repeat(80));
        console.log('   (VACUUM muss außerhalb der Transaktion laufen)');
        console.log('');

        db.exec('VACUUM');

        console.log('   ✅ VACUUM completed');
        console.log('');
    }

    // ================================================================
    // STATISTIKEN
    // ================================================================

    console.log('');
    console.log('═'.repeat(80));
    console.log('📊 MIGRATION STATISTICS');
    console.log('═'.repeat(80));

    const finalStats = {
        games: db.prepare('SELECT COUNT(*) as c FROM games').get().c,
        gamesWithScores: db.prepare('SELECT COUNT(*) as c FROM games WHERE home_score IS NOT NULL').get().c,
        gamesWithDates: db.prepare('SELECT COUNT(*) as c FROM games WHERE datetime_iso IS NOT NULL').get().c,
        teams: db.prepare('SELECT COUNT(*) as c FROM teams').get().c,
        players: db.prepare('SELECT COUNT(*) as c FROM players').get().c,
        venues: db.prepare('SELECT COUNT(*) as c FROM venues').get().c,
        indexes: db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").get().c
    };

    console.log('');
    console.log('Atomare Felder:');
    console.log(`  Games with parsed scores:     ${finalStats.gamesWithScores.toLocaleString()} / ${finalStats.games.toLocaleString()}`);
    console.log(`  Games with parsed dates:      ${finalStats.gamesWithDates.toLocaleString()} / ${finalStats.games.toLocaleString()}`);
    console.log('');
    console.log('Normalisierung:');
    console.log(`  Teams created:                ${finalStats.teams.toLocaleString()}`);
    console.log(`  Players created:              ${finalStats.players.toLocaleString()}`);
    console.log(`  Venues created:               ${finalStats.venues.toLocaleString()}`);
    console.log('');
    console.log('Performance:');
    console.log(`  Indexes created:              ${finalStats.indexes.toLocaleString()}`);
    console.log(`  Duplicates removed:           ${migrationStats.duplicatesRemoved.toLocaleString()}`);
    console.log('');

    // Beispiel-Queries
    console.log('═'.repeat(80));
    console.log('🎯 EXAMPLE QUERIES YOU CAN NOW RUN');
    console.log('═'.repeat(80));
    console.log('');
    console.log('-- Top 10 highest scoring games');
    const topGames = db.prepare(`
        SELECT t1.name as home, t2.name as guest, g.home_score, g.guest_score, g.total_goals, g.date_iso
        FROM games g
        LEFT JOIN teams t1 ON g.home_team_id = t1.id
        LEFT JOIN teams t2 ON g.guest_team_id = t2.id
        WHERE g.total_goals IS NOT NULL
        ORDER BY g.total_goals DESC
        LIMIT 5
    `).all();

    topGames.forEach((g, i) => {
        console.log(`${i+1}. ${g.home || 'Unknown'} ${g.home_score}:${g.guest_score} ${g.guest || 'Unknown'} (${g.total_goals} goals) - ${g.date_iso || ''}`);
    });

    console.log('');
    console.log('-- Games by day of week');
    const byDay = db.prepare(`
        SELECT start_day_of_week, COUNT(*) as count
        FROM games
        WHERE start_day_of_week IS NOT NULL
        GROUP BY start_day_of_week
        ORDER BY count DESC
        LIMIT 5
    `).all();

    byDay.forEach(d => {
        console.log(`${d.start_day_of_week}: ${d.count} games`);
    });

    console.log('');
    console.log('-- Top teams by total games');
    const topTeams = db.prepare(`
        SELECT name, COUNT(*) as games
        FROM teams t
        INNER JOIN (
            SELECT home_team_id as team_id FROM games
            UNION ALL
            SELECT guest_team_id as team_id FROM games
        ) g ON t.id = g.team_id
        GROUP BY t.id
        ORDER BY games DESC
        LIMIT 5
    `).all();

    topTeams.forEach(t => {
        console.log(`${t.name}: ${t.games} games`);
    });

    console.log('');
    console.log('═'.repeat(80));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(80));
    console.log('');
    console.log('Backup location:', BACKUP_PATH);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Test the application: npm run dev');
    console.log('  2. Verify data integrity');
    console.log('  3. Update frontend queries to use new atomic fields');
    console.log('  4. Consider dropping old non-atomic columns after verification');
    console.log('  5. Delete backup after everything is verified');
    console.log('');

} catch (error) {
    console.error('');
    console.error('═'.repeat(80));
    console.error('❌ MIGRATION FAILED');
    console.error('═'.repeat(80));
    console.error('Error:', error.message);
    console.error('');
    console.error('Restoring from backup...');
    db.close();

    if (fs.existsSync(BACKUP_PATH)) {
        fs.copyFileSync(BACKUP_PATH, DB_PATH);
        console.error('✅ Database restored from backup');
    }

    console.error('');
    process.exit(1);
} finally {
    db.close();
}
