#!/usr/bin/env node

/**
 * Database Migration Script - Team Normalization
 *
 * Erstellt eine normalisierte Teams-Tabelle und migriert bestehende Daten
 * WICHTIG: Backup erstellen vor Ausführung!
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../src/assets/data/seasons.db');
const BACKUP_PATH = path.join(__dirname, '../src/assets/data/seasons.db.backup');

console.log('🏊 Team Normalization Migration');
console.log('='.repeat(80));

// Backup erstellen
if (!fs.existsSync(BACKUP_PATH)) {
    console.log('📦 Creating backup...');
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
    console.log('✅ Backup created at:', BACKUP_PATH);
} else {
    console.log('ℹ️  Backup already exists');
}

const db = new Database(DB_PATH);

try {
    db.transaction(() => {
        // 1. Teams Tabelle erstellen
        console.log('\n1️⃣  Creating teams table...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                short_name TEXT,
                city TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Alle einzigartigen Teams aus games extrahieren
        console.log('2️⃣  Extracting unique teams...');
        const teams = new Set();

        const homeTeams = db.prepare('SELECT DISTINCT TRIM(home_team) as team FROM games WHERE home_team IS NOT NULL').all();
        const guestTeams = db.prepare('SELECT DISTINCT TRIM(guest_team) as team FROM games WHERE guest_team IS NOT NULL').all();

        homeTeams.forEach(row => teams.add(row.team));
        guestTeams.forEach(row => teams.add(row.team));

        console.log(`   Found ${teams.size} unique teams`);

        // 3. Teams einfügen
        console.log('3️⃣  Inserting teams...');
        const insertTeam = db.prepare('INSERT OR IGNORE INTO teams (name) VALUES (?)');

        let inserted = 0;
        for (const team of teams) {
            const result = insertTeam.run(team);
            if (result.changes > 0) inserted++;
        }
        console.log(`   ✅ Inserted ${inserted} teams`);

        // 4. Neue Spalten zu games hinzufügen
        console.log('4️⃣  Adding foreign key columns to games...');
        db.exec(`
            ALTER TABLE games ADD COLUMN home_team_id INTEGER;
            ALTER TABLE games ADD COLUMN guest_team_id INTEGER;
        `);

        // 5. IDs aktualisieren
        console.log('5️⃣  Updating team IDs in games...');
        const updateHome = db.prepare(`
            UPDATE games
            SET home_team_id = (SELECT id FROM teams WHERE name = TRIM(games.home_team))
            WHERE home_team IS NOT NULL
        `);
        const updateGuest = db.prepare(`
            UPDATE games
            SET guest_team_id = (SELECT id FROM teams WHERE name = TRIM(games.guest_team))
            WHERE guest_team IS NOT NULL
        `);

        updateHome.run();
        updateGuest.run();
        console.log('   ✅ Team IDs updated');

        // 6. Validierung
        console.log('6️⃣  Validating migration...');
        const nullHomeIds = db.prepare('SELECT COUNT(*) as c FROM games WHERE home_team IS NOT NULL AND home_team_id IS NULL').get();
        const nullGuestIds = db.prepare('SELECT COUNT(*) as c FROM games WHERE guest_team IS NOT NULL AND guest_team_id IS NULL').get();

        if (nullHomeIds.c > 0 || nullGuestIds.c > 0) {
            throw new Error(`Migration validation failed: ${nullHomeIds.c} home teams, ${nullGuestIds.c} guest teams not mapped`);
        }
        console.log('   ✅ All teams mapped correctly');

        // 7. Indizes für Performance
        console.log('7️⃣  Creating indexes...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
            CREATE INDEX IF NOT EXISTS idx_games_home_team_id ON games(home_team_id);
            CREATE INDEX IF NOT EXISTS idx_games_guest_team_id ON games(guest_team_id);
        `);

        // 8. Statistiken
        console.log('\n📊 Migration Statistics:');
        const stats = db.prepare(`
            SELECT
                COUNT(DISTINCT home_team_id) as unique_home_teams,
                COUNT(DISTINCT guest_team_id) as unique_guest_teams,
                COUNT(*) as total_games
            FROM games
        `).get();

        console.log('   Teams in database:', db.prepare('SELECT COUNT(*) as c FROM teams').get().c);
        console.log('   Unique home teams:', stats.unique_home_teams);
        console.log('   Unique guest teams:', stats.unique_guest_teams);
        console.log('   Total games:', stats.total_games);

        // 9. Top Teams
        console.log('\n🏆 Top 10 Teams by Game Count:');
        const topTeams = db.prepare(`
            SELECT
                t.name,
                COUNT(*) as game_count
            FROM teams t
            INNER JOIN (
                SELECT home_team_id as team_id FROM games
                UNION ALL
                SELECT guest_team_id as team_id FROM games
            ) g ON t.id = g.team_id
            GROUP BY t.id
            ORDER BY game_count DESC
            LIMIT 10
        `).all();

        topTeams.forEach((team, idx) => {
            console.log(`   ${(idx + 1).toString().padStart(2)}. ${team.name.padEnd(40)} ${team.game_count.toLocaleString().padStart(6)} games`);
        });

        // ANALYZE für Query Optimizer
        console.log('\n8️⃣  Optimizing database...');
        db.exec('ANALYZE');

    })();

    console.log('\n✅ Migration completed successfully!');
    console.log('\n⚠️  IMPORTANT NEXT STEPS:');
    console.log('   1. Test the application thoroughly');
    console.log('   2. Update queries to use team_id instead of team name');
    console.log('   3. After verification, you can DROP the old columns:');
    console.log('      ALTER TABLE games DROP COLUMN home_team;');
    console.log('      ALTER TABLE games DROP COLUMN guest_team;');
    console.log('   4. Run VACUUM to reclaim space');

} catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('   Restoring from backup...');
    db.close();
    fs.copyFileSync(BACKUP_PATH, DB_PATH);
    console.error('   ✅ Backup restored');
    process.exit(1);
} finally {
    db.close();
}

console.log('\n' + '='.repeat(80));
