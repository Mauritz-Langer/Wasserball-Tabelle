/**
 * Slim the browser-shipped SQLite database.
 *
 * The scraper produces a ~550 MB database that every visitor would otherwise
 * download in full. Two things dominate that size:
 *
 *   1. Team logos: each logo is stored as a base64 data-URI in every
 *      `table_entries` row. There are only ~80 distinct logos across thousands
 *      of rows. They are moved into a shared `logos(hash, data)` table and
 *      referenced via `table_entries.logo_hash`; the duplicated blobs are
 *      emptied. This alone takes the DB from ~550 MB to ~169 MB.
 *
 *   2. Per-game detail tables (events, lineups, officials, quarter scores,
 *      team details) are moved into a separate sibling details.db. The app
 *      loads it lazily, only the first time a user opens a historical
 *      game-details page — so browsing archive tables/games/scorers stays
 *      light. Pass --drop-details to discard them entirely (no details.db).
 *
 * Result: core seasons.db ~550 MB -> ~55 MB (gzip ~15 MB) + details.db ~110 MB
 * (lazy). The core DB is only fetched when a user opens an archive season; the
 * details DB only when they open a specific historical game.
 *
 * Idempotent and safe to re-run. Run as the final step of the data pipeline
 * (after scrape-seasons.js). Shells out to the `sqlite3` CLI so it needs no
 * native node module and stays low-memory even on the full database.
 *
 * Usage:
 *   node scripts/slim-db.js [path/to/seasons.db] [--drop-details]
 * Defaults to public/assets/data/seasons.db (the file shipped to the browser).
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DROP_DETAILS = process.argv.includes('--drop-details');
const DB_PATH = positional[0]
  ? path.resolve(positional[0])
  : path.join(__dirname, '../public/assets/data/seasons.db');

// Per-game detail tables. Only dropped when --drop-details is passed; otherwise
// kept so the historical game-details view can read them.
const DETAIL_TABLES = [
  'game_events',
  'game_lineups',
  'game_officials',
  'game_quarter_scores',
  'game_team_details',
];

const mb = bytes => (bytes / 1024 / 1024).toFixed(1);
const fileSize = p => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};

function sqlite(sql, { allowFail = false } = {}) {
  const res = spawnSync('sqlite3', [DB_PATH], { input: sql, encoding: 'utf8' });
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      console.error('`sqlite3` CLI not found. Install it (e.g. `brew install sqlite`).');
      process.exit(1);
    }
    throw res.error;
  }
  if (res.status !== 0 && !allowFail) {
    console.error(res.stderr || `sqlite3 exited with code ${res.status}`);
    process.exit(1);
  }
  return res.stdout.trim();
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const sizeBefore = fileSize(DB_PATH);
  console.log(`Slimming ${DB_PATH} (${mb(sizeBefore)} MB)`);

  // --- 1. Deduplicate logos -------------------------------------------------
  // Add the reference column if missing (ignore "duplicate column" on re-run).
  sqlite(`ALTER TABLE table_entries ADD COLUMN logo_hash TEXT;`, { allowFail: true });

  const distinct = sqlite(
    `SELECT count(DISTINCT image_url) FROM table_entries WHERE image_url IS NOT NULL AND image_url != '';`
  );
  console.log(`Deduplicating ${distinct || 0} distinct logos…`);

  sqlite(`
    PRAGMA journal_mode = DELETE;

    CREATE TABLE IF NOT EXISTS logos (hash TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_logos_data ON logos(data);

    INSERT OR IGNORE INTO logos (hash, data)
    SELECT printf('logo%04d', row_number() OVER (ORDER BY image_url)), image_url
    FROM (
      SELECT DISTINCT image_url FROM table_entries
      WHERE image_url IS NOT NULL AND image_url != ''
    );

    UPDATE table_entries
    SET logo_hash = (SELECT hash FROM logos WHERE data = table_entries.image_url)
    WHERE image_url IS NOT NULL AND image_url != '';

    UPDATE table_entries SET image_url = NULL WHERE logo_hash IS NOT NULL;

    DROP INDEX IF EXISTS idx_logos_data;
    CREATE INDEX IF NOT EXISTS idx_table_entries_logo_hash ON table_entries(logo_hash);
  `);

  // --- 2. Split per-game detail tables into a separate details.db ------------
  // Browsing archive tables/games/scorers only needs the small core DB. The
  // (large) per-game detail tables are moved into a sibling details.db that the
  // app loads lazily, the first time a user opens a historical game-details
  // page. This keeps the core download ~55 MB and avoids loading ~110 MB of
  // events/lineups into mobile RAM unless actually needed.
  const detailsPath = path.join(path.dirname(DB_PATH), 'details.db');
  if (DROP_DETAILS) {
    console.log(`Dropping ${DETAIL_TABLES.length} detail tables (--drop-details)…`);
    sqlite(DETAIL_TABLES.map(t => `DROP TABLE IF EXISTS ${t};`).join('\n'));
    if (fs.existsSync(detailsPath)) fs.unlinkSync(detailsPath);
  } else {
    console.log(`Extracting ${DETAIL_TABLES.length} detail tables into details.db…`);
    if (fs.existsSync(detailsPath)) fs.unlinkSync(detailsPath);
    const copy = [
      `ATTACH '${detailsPath.replace(/'/g, "''")}' AS d;`,
      `PRAGMA d.journal_mode = DELETE;`,
      ...DETAIL_TABLES.map(t => `CREATE TABLE d.${t} AS SELECT * FROM ${t};`),
      // Index every detail table on game_id (the only lookup key used).
      ...DETAIL_TABLES.map(t => `CREATE INDEX d.idx_${t}_game_id ON ${t}(game_id);`),
      `DETACH d;`,
    ].join('\n');
    sqlite(copy);
    // Drop them from the core DB.
    sqlite(DETAIL_TABLES.map(t => `DROP TABLE IF EXISTS ${t};`).join('\n'));
    console.log(`Wrote ${detailsPath} (${mb(fileSize(detailsPath))} MB).`);
  }

  // --- 3. Reclaim freed space ------------------------------------------------
  console.log('Reclaiming space (VACUUM)…');
  sqlite('VACUUM;');

  // journal_mode = DELETE leaves no -wal/-shm, but clean up any stragglers.
  for (const base of [DB_PATH, detailsPath]) {
    for (const ext of ['-wal', '-shm']) {
      const side = base + ext;
      if (fs.existsSync(side)) fs.unlinkSync(side);
    }
  }

  const sizeAfter = fileSize(DB_PATH);
  console.log(
    `Done. ${mb(sizeBefore)} MB -> ${mb(sizeAfter)} MB ` +
      `(${(100 - (sizeAfter / sizeBefore) * 100).toFixed(1)}% smaller).`
  );
}

main();
