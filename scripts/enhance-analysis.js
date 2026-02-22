#!/usr/bin/env node

/**
 * Enhanced Analysis Migration Script
 *
 * Fügt strukturierte Felder hinzu für bessere Datenanalyse:
 * - Separate Score-Spalten (home_score, guest_score)
 * - Datums-Komponenten (year, month, day_of_week)
 * - Berechnete Metriken (goal_difference, total_goals)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../src/assets/data/seasons.db');
const BACKUP_PATH = path.join(__dirname, `../src/assets/data/seasons.db.backup.${Date.now()}`);

console.log('🔬 Enhanced Analysis Migration');
console.log('='.repeat(80));

// Backup erstellen
console.log('📦 Creating backup...');
fs.copyFileSync(DB_PATH, BACKUP_PATH);
console.log('✅ Backup created at:', BACKUP_PATH);

const db = new Database(DB_PATH);

try {
    db.transaction(() => {
        console.log('\n1️⃣  Adding score columns...');

        // Prüfe ob Spalten schon existieren
        const columns = db.prepare("PRAGMA table_info(games)").all();
        const existingCols = columns.map(c => c.name);

        if (!existingCols.includes('home_score')) {
            db.exec(`
                ALTER TABLE games ADD COLUMN home_score INTEGER;
                ALTER TABLE games ADD COLUMN guest_score INTEGER;
                ALTER TABLE games ADD COLUMN goal_difference INTEGER;
                ALTER TABLE games ADD COLUMN total_goals INTEGER;
            `);
            console.log('   ✅ Score columns added');
        } else {
            console.log('   ℹ️  Score columns already exist');
        }

        console.log('\n2️⃣  Migrating existing scores...');

        // Parse "X:Y" Format
        const games = db.prepare(`
            SELECT id, result
            FROM games
            WHERE result IS NOT NULL
              AND result != ' - '
              AND result != ''
              AND home_score IS NULL
        `).all();

        console.log(`   Processing ${games.length} games...`);

        const updateScore = db.prepare(`
            UPDATE games SET
                home_score = ?,
                guest_score = ?,
                goal_difference = ?,
                total_goals = ?
            WHERE id = ?
        `);

        let updated = 0;
        let failed = 0;

        for (const game of games) {
            try {
                const [homeStr, guestStr] = game.result.split(':');
                const home = parseInt(homeStr?.trim());
                const guest = parseInt(guestStr?.trim());

                if (!isNaN(home) && !isNaN(guest)) {
                    updateScore.run(home, guest, home - guest, home + guest, game.id);
                    updated++;
                } else {
                    failed++;
                }
            } catch (e) {
                failed++;
            }
        }

        console.log(`   ✅ Updated ${updated} games`);
        if (failed > 0) console.log(`   ⚠️  Failed to parse ${failed} results`);

        console.log('\n3️⃣  Adding date columns...');

        if (!existingCols.includes('start_year')) {
            db.exec(`
                ALTER TABLE games ADD COLUMN start_year INTEGER;
                ALTER TABLE games ADD COLUMN start_month INTEGER;
                ALTER TABLE games ADD COLUMN start_day INTEGER;
                ALTER TABLE games ADD COLUMN start_hour INTEGER;
                ALTER TABLE games ADD COLUMN start_day_of_week TEXT;
            `);
            console.log('   ✅ Date columns added');
        } else {
            console.log('   ℹ️  Date columns already exist');
        }

        console.log('\n4️⃣  Parsing dates...');

        const gamesWithDates = db.prepare(`
            SELECT id, start_time
            FROM games
            WHERE start_time IS NOT NULL
              AND start_time != ''
              AND start_year IS NULL
        `).all();

        console.log(`   Processing ${gamesWithDates.length} games...`);

        const updateDate = db.prepare(`
            UPDATE games SET
                start_year = ?,
                start_month = ?,
                start_day = ?,
                start_hour = ?,
                start_day_of_week = ?
            WHERE id = ?
        `);

        const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

        let dateUpdated = 0;
        let dateFailed = 0;

        for (const game of gamesWithDates) {
            try {
                // Format: "04.10.25, 16:00 Uhr" oder "04.10.2025 17:09 Uhr"
                const match = game.start_time.match(/(\d{2})\.(\d{2})\.(\d{2,4})[,\s]+(\d{1,2}):(\d{2})/);

                if (match) {
                    const [, day, month, yearShort, hour] = match;
                    const year = yearShort.length === 2 ? 2000 + parseInt(yearShort) : parseInt(yearShort);

                    // JavaScript Date für day_of_week
                    const date = new Date(year, parseInt(month) - 1, parseInt(day));
                    const dayOfWeek = dayNames[date.getDay()];

                    updateDate.run(
                        year,
                        parseInt(month),
                        parseInt(day),
                        parseInt(hour),
                        dayOfWeek,
                        game.id
                    );
                    dateUpdated++;
                } else {
                    dateFailed++;
                }
            } catch (e) {
                dateFailed++;
            }
        }

        console.log(`   ✅ Parsed ${dateUpdated} dates`);
        if (dateFailed > 0) console.log(`   ⚠️  Failed to parse ${dateFailed} dates`);

        console.log('\n5️⃣  Creating indexes for new columns...');

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_games_home_score ON games(home_score);
            CREATE INDEX IF NOT EXISTS idx_games_guest_score ON games(guest_score);
            CREATE INDEX IF NOT EXISTS idx_games_goal_diff ON games(goal_difference);
            CREATE INDEX IF NOT EXISTS idx_games_total_goals ON games(total_goals);

            CREATE INDEX IF NOT EXISTS idx_games_start_year ON games(start_year);
            CREATE INDEX IF NOT EXISTS idx_games_start_month ON games(start_month);
            CREATE INDEX IF NOT EXISTS idx_games_start_day_of_week ON games(start_day_of_week);
            CREATE INDEX IF NOT EXISTS idx_games_date_components ON games(start_year, start_month);
        `);

        console.log('   ✅ Indexes created');

        console.log('\n6️⃣  Running ANALYZE...');
        db.exec('ANALYZE');

        console.log('\n📊 Migration Statistics:');
        const stats = db.prepare(`
            SELECT
                COUNT(*) as total_games,
                COUNT(home_score) as games_with_scores,
                COUNT(start_year) as games_with_dates,
                AVG(total_goals) as avg_total_goals,
                MAX(total_goals) as max_total_goals,
                MIN(total_goals) as min_total_goals
            FROM games
        `).get();

        console.log('   Total games:', stats.total_games.toLocaleString());
        console.log('   Games with scores:', stats.games_with_scores.toLocaleString());
        console.log('   Games with dates:', stats.games_with_dates.toLocaleString());
        if (stats.avg_total_goals) {
            console.log('   Avg goals per game:', stats.avg_total_goals.toFixed(2));
            console.log('   Highest scoring game:', stats.max_total_goals);
            console.log('   Lowest scoring game:', stats.min_total_goals);
        }

        console.log('\n🎯 Top 5 Highest Scoring Games:');
        const topGames = db.prepare(`
            SELECT home_team, guest_team, home_score, guest_score, total_goals, start_time
            FROM games
            WHERE total_goals IS NOT NULL
            ORDER BY total_goals DESC
            LIMIT 5
        `).all();

        topGames.forEach((game, idx) => {
            console.log(`   ${idx + 1}. ${game.home_team} ${game.home_score}:${game.guest_score} ${game.guest_team} (${game.total_goals} Tore)`);
        });

        console.log('\n📅 Games by Day of Week:');
        const byDayOfWeek = db.prepare(`
            SELECT start_day_of_week, COUNT(*) as count
            FROM games
            WHERE start_day_of_week IS NOT NULL
            GROUP BY start_day_of_week
            ORDER BY count DESC
        `).all();

        byDayOfWeek.forEach(row => {
            const bar = '█'.repeat(Math.floor(row.count / 100));
            console.log(`   ${row.start_day_of_week.padEnd(10)} ${row.count.toString().padStart(6)} ${bar}`);
        });

        console.log('\n📈 Games by Month:');
        const byMonth = db.prepare(`
            SELECT start_month, COUNT(*) as count
            FROM games
            WHERE start_month IS NOT NULL
            GROUP BY start_month
            ORDER BY start_month
        `).all();

        const monthNames = ['', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        byMonth.forEach(row => {
            const bar = '█'.repeat(Math.floor(row.count / 100));
            console.log(`   ${monthNames[row.start_month].padEnd(4)} ${row.count.toString().padStart(6)} ${bar}`);
        });

    })();

    console.log('\n✅ Migration completed successfully!');
    console.log('\n💡 NEW ANALYSIS QUERIES YOU CAN NOW RUN:');
    console.log('');
    console.log('   -- Highest scoring games');
    console.log('   SELECT * FROM games ORDER BY total_goals DESC LIMIT 10;');
    console.log('');
    console.log('   -- Closest games');
    console.log('   SELECT * FROM games WHERE ABS(goal_difference) <= 2;');
    console.log('');
    console.log('   -- Games by year');
    console.log('   SELECT start_year, COUNT(*) FROM games GROUP BY start_year;');
    console.log('');
    console.log('   -- Weekend games');
    console.log('   SELECT COUNT(*) FROM games WHERE start_day_of_week IN ("Samstag", "Sonntag");');
    console.log('');
    console.log('   -- Average goals per month');
    console.log('   SELECT start_month, AVG(total_goals) FROM games GROUP BY start_month;');
    console.log('');

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
console.log('Backup saved at:', BACKUP_PATH);
console.log('You can delete it after verifying the migration.');
