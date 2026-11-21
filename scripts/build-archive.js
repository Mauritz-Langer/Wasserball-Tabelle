/**
 * Build the archive files the browser actually downloads.
 *
 * The app runs entirely on the client: sql.js loads a database file into
 * memory and queries it there. Download size and memory are therefore the
 * performance budget. slim-db.js leaves two big files (seasons.db ~58 MB,
 * details.db ~118 MB, all 15 seasons in one piece). This script splits them by
 * what a visitor actually looks at and compresses each piece:
 *
 *   archive/stats.db.gz          all seasons, only what the statistics need:
 *                                integer keys, no logos, no text primary keys,
 *                                no secondary indexes (the tables are small
 *                                enough to scan in memory in a few ms).
 *   archive/season-<year>.db.gz  leagues, games, tables and scorers of ONE
 *                                season — loaded when that archive season is
 *                                opened.
 *   archive/logos/<hash>.svg     the ~80 distinct team logos as plain image
 *                                files: only the logos on screen are fetched,
 *                                lazily, and cached like any image. Logos that
 *                                are really a
 *                                large PNG wrapped in SVG are scaled down to
 *                                the size they are shown at (needs `sips`,
 *                                macOS; skipped elsewhere).
 *   archive/details-<year>.db.gz events, lineups, officials, quarter scores of
 *                                ONE season — loaded when a game report of
 *                                that season is opened. Rows are clustered by
 *                                game (WITHOUT ROWID), so no index is needed.
 *   archive/teams.json           team -> leagues of the latest archived season
 *                                (lets the app find a team by name).
 *   archive/archive.json         manifest with the sizes of every file.
 *
 * Run as the last step of the data pipeline:
 *   node scripts/scrape-seasons.js && node scripts/slim-db.js && node scripts/build-archive.js
 *
 * Usage: node scripts/build-archive.js [dir-with-seasons.db-and-details.db]
 * Needs the `sqlite3` CLI (3.41+ for base64()); no native node modules.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ARGS = process.argv.slice(2);
/** --logos-only: rebuild archive/logos/ and keep every other file. */
const LOGOS_ONLY = ARGS.includes('--logos-only');
const DIR_ARG = ARGS.find(a => !a.startsWith('--'));
const SRC_DIR = DIR_ARG
  ? path.resolve(DIR_ARG)
  : path.join(__dirname, '../public/assets/data');
const CORE = path.join(SRC_DIR, 'seasons.db');
const DETAILS = path.join(SRC_DIR, 'details.db');
const OUT_DIR = path.join(__dirname, '../public/assets/data/archive');
const TMP_DIR = path.join(OUT_DIR, '.tmp');

const mb = bytes => (bytes / 1024 / 1024).toFixed(2);

const TRACE = process.env.ARCHIVE_TRACE === '1';

function sqlite(dbPath, sql, attempt = 1) {
  const t0 = Date.now();
  // Every step takes seconds. A sqlite3 process that hangs (seen occasionally
  // when it is spawned) is killed after two minutes and the step repeated.
  const res = spawnSync('sqlite3', ['-bail', dbPath], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 120_000, killSignal: 'SIGKILL' });
  if (TRACE) console.log(`    [${((Date.now() - t0) / 1000).toFixed(1)}s] sqlite3 ${path.basename(dbPath)}: ${sql.trim().slice(0, 60).replace(/\s+/g, ' ')}`);
  if (res.error?.code === 'ETIMEDOUT' || res.signal === 'SIGKILL') {
    if (attempt >= 3) throw new Error(`sqlite3 timed out three times for ${path.basename(dbPath)}`);
    console.log(`  sqlite3 did not answer within 2 minutes – retrying (${attempt}/2)`);
    // Statements on a fresh output file must start again from an empty file.
    if (dbPath.startsWith(TMP_DIR)) fs.rmSync(dbPath, { force: true });
    return sqlite(dbPath, sql, attempt + 1);
  }
  if (res.status !== 0) {
    throw new Error(`sqlite3 failed for ${path.basename(dbPath)}:\n${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

const quote = p => `'${p.replace(/'/g, "''")}'`;

/**
 * SQL expression that collapses all whitespace runs (the scraper keeps the
 * HTML indentation, e.g. "Deutscher\n                Wasserball Pokal") into
 * single spaces. SQLite has no regex, so: turn control whitespace into spaces,
 * then repeatedly halve runs of spaces.
 */
function cleanText(expr) {
  let sql = `replace(replace(replace(${expr}, char(13), ' '), char(10), ' '), char(9), ' ')`;
  for (let i = 0; i < 3; i++) sql = `replace(${sql}, '        ', ' ')`;
  for (let i = 0; i < 4; i++) sql = `replace(${sql}, '  ', ' ')`;
  return `trim(${sql})`;
}

/** Compress a finished database and record its sizes in the manifest. */
function ship(tmpPath, name, manifest) {
  const raw = fs.readFileSync(tmpPath);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(path.join(OUT_DIR, `${name}.db.gz`), gz);
  manifest.files[name] = { bytes: raw.length, gzBytes: gz.length };
  console.log(`  ${name.padEnd(14)} ${mb(raw.length).padStart(7)} MB  ->  ${mb(gz.length).padStart(6)} MB gzip`);
}

function fresh(name) {
  const p = path.join(TMP_DIR, `${name}.db`);
  fs.rmSync(p, { force: true });
  return p;
}

/**
 * Mapping raw club name -> cleaned name ("OSC Potsdam II II" -> "OSC Potsdam II",
 * whitespace collapsed), computed once per distinct name. Creates the table
 * `club_map(raw, clean)` in the given schema from src.scorers.
 */
function clubMapSql(schema = 'temp') {
  let fix = 'c';
  for (const suffix of ['IV', 'III', 'II']) {
    fix = `CASE WHEN ${fix} LIKE '% ${suffix} ${suffix}' THEN substr(${fix}, 1, length(${fix}) - ${suffix.length + 1}) ELSE ${fix} END`;
  }
  // The suffix CASE repeats its input; feed it a plain column of a
  // materialised CTE so the text cleaning itself runs once per name.
  return `
    CREATE TABLE ${schema}.club_map(raw TEXT PRIMARY KEY, clean TEXT NOT NULL) WITHOUT ROWID;
    WITH names AS MATERIALIZED (
      SELECT DISTINCT team AS raw, ${cleanText('team')} AS c FROM src.scorers WHERE team IS NOT NULL)
    INSERT INTO ${schema}.club_map SELECT raw, ${fix} FROM names;`;
}

// ---------------------------------------------------------------------------

function buildStats(manifest) {
  const out = fresh('stats');
  sqlite(out, `
    PRAGMA page_size = 4096;
    PRAGMA journal_mode = OFF;
    ATTACH ${quote(CORE)} AS src;

    -- Leagues get a compact integer key; the text id stays for linking into the app.
    CREATE TABLE leagues(
      no INTEGER PRIMARY KEY,
      id TEXT NOT NULL,
      season INTEGER NOT NULL,
      name TEXT NOT NULL
    );
    INSERT INTO leagues(id, season, name)
      SELECT id, CAST(season_id AS INTEGER), ${cleanText('name')} FROM src.leagues ORDER BY season_id, name;

    CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO teams SELECT id, name FROM src.teams;

    CREATE TABLE players(id INTEGER PRIMARY KEY, name TEXT NOT NULL, birth_year INTEGER);
    INSERT INTO players SELECT id, name, birth_year FROM src.players;

    -- Club names as they appear in scorer lists (not always a known team).
    CREATE TABLE clubs(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    ${clubMapSql()}
    INSERT INTO clubs(name) SELECT DISTINCT clean FROM club_map ORDER BY clean;

    -- Played games only, in chronological order (rowid order = time order).
    CREATE TABLE games(
      id TEXT NOT NULL,
      league INTEGER NOT NULL,
      day TEXT,
      home INTEGER NOT NULL,
      guest INTEGER NOT NULL,
      hs INTEGER NOT NULL,
      gs INTEGER NOT NULL
    );
    INSERT INTO games
      SELECT g.id, l.no, g.date_iso, g.home_team_id, g.guest_team_id, g.home_score, g.guest_score
      FROM src.games g JOIN leagues l ON l.id = g.league_id
      WHERE g.home_score IS NOT NULL AND g.guest_score IS NOT NULL
        AND g.home_team_id IS NOT NULL AND g.guest_team_id IS NOT NULL
      ORDER BY g.date_iso, g.id;

    -- A handful of games are listed in two leagues (e.g. a regional and a
    -- youth round): count each game once.
    DELETE FROM games WHERE day IS NOT NULL AND rowid NOT IN (
      SELECT MIN(rowid) FROM games WHERE day IS NOT NULL GROUP BY day, home, guest, hs, gs);

    -- One row per player, league and club; clustered by player.
    CREATE TABLE scorers(
      player INTEGER NOT NULL,
      league INTEGER NOT NULL,
      club INTEGER NOT NULL,
      goals INTEGER NOT NULL,
      games INTEGER NOT NULL,
      PRIMARY KEY (player, league, club)
    ) WITHOUT ROWID;
    INSERT OR REPLACE INTO scorers
      SELECT s.player_id, l.no, c.id, COALESCE(s.goals, 0), COALESCE(s.games, 0)
      FROM src.scorers s
      JOIN leagues l ON l.id = s.league_id
      JOIN club_map m ON m.raw = s.team
      JOIN clubs c ON c.name = m.clean
      WHERE s.player_id IS NOT NULL;

    -- DSV publishes the scorer list of a competition "over all groups and
    -- rounds" on the page of every round (Vorrunde, Playoff A, Relegation …).
    -- The same goals would be counted once per round — almost half of all
    -- scorer goals in the raw data. A row is a copy when the same player has
    -- exactly the same goals and games for the same club in the same season,
    -- in a league whose name starts with the same two words.
    CREATE TEMP TABLE scorer_keys AS
      SELECT s.player, s.league, s.club, s.goals, s.games, l.season,
             substr(l.name || ' ', 1,
               instr(l.name || ' ', ' ') + instr(substr(l.name || ' ', instr(l.name || ' ', ' ') + 1) || ' ', ' ')) AS competition
      FROM scorers s JOIN leagues l ON l.no = s.league;
    DELETE FROM scorers WHERE (player, league, club) IN (
      SELECT k.player, k.league, k.club FROM scorer_keys k
      WHERE EXISTS (
        SELECT 1 FROM scorer_keys o
        WHERE o.player = k.player AND o.club = k.club AND o.season = k.season
          AND o.goals = k.goals AND o.games = k.games AND o.competition = k.competition
          AND o.league < k.league));
    DROP TABLE scorer_keys;

    DETACH src;
    VACUUM;
  `);
  ship(out, 'stats', manifest);
}

function buildSeason(season, manifest) {
  const out = fresh(`season-${season}`);
  sqlite(out, `
    PRAGMA page_size = 4096;
    PRAGMA journal_mode = OFF;
    ATTACH ${quote(CORE)} AS src;

    CREATE TABLE leagues(id TEXT PRIMARY KEY, season_id TEXT, name TEXT) WITHOUT ROWID;
    INSERT INTO leagues SELECT id, season_id, ${cleanText('name')} FROM src.leagues WHERE season_id = '${season}';

    CREATE TABLE games(
      id TEXT PRIMARY KEY, league_id TEXT, start_time TEXT, home_team TEXT, guest_team TEXT,
      location TEXT, result TEXT, play_kind TEXT, final_score TEXT, scoring_system TEXT,
      end_time TEXT, organizer TEXT, notes TEXT, video_link TEXT, protocol_link TEXT,
      pool_name TEXT, pool_city TEXT, google_maps_link TEXT
    ) WITHOUT ROWID;
    INSERT INTO games
      SELECT id, league_id, start_time, home_team, guest_team, location, result, play_kind,
             final_score, scoring_system, end_time, organizer, notes, video_link, protocol_link,
             pool_name, pool_city, google_maps_link
      FROM src.games WHERE league_id IN (SELECT id FROM leagues);
    CREATE INDEX idx_games_league ON games(league_id);

    CREATE TABLE table_entries(
      league_id TEXT, place INTEGER, team TEXT, games_played INTEGER, wins INTEGER, draws INTEGER,
      losses INTEGER, goals TEXT, goal_diff INTEGER, points INTEGER, info TEXT, logo_hash TEXT,
      seq INTEGER, PRIMARY KEY (league_id, seq)
    ) WITHOUT ROWID;
    INSERT INTO table_entries
      SELECT league_id, place, team, games_played, wins, draws, losses, goals, goal_diff, points,
             NULLIF(info, ''), logo_hash,
             ROW_NUMBER() OVER (PARTITION BY league_id ORDER BY place, team)
      FROM src.table_entries WHERE league_id IN (SELECT id FROM leagues);

    CREATE TABLE scorers(
      league_id TEXT, place INTEGER, name TEXT, team TEXT, birth_year TEXT, goals INTEGER, games INTEGER,
      seq INTEGER, PRIMARY KEY (league_id, seq)
    ) WITHOUT ROWID;
    ${clubMapSql()}
    INSERT INTO scorers
      SELECT s.league_id, s.place, ${cleanText('s.name')}, COALESCE(m.clean, s.team), NULLIF(s.birth_year, ''), s.goals, s.games,
             ROW_NUMBER() OVER (PARTITION BY s.league_id ORDER BY s.place, s.name)
      FROM src.scorers s LEFT JOIN club_map m ON m.raw = s.team
      WHERE s.league_id IN (SELECT id FROM leagues);

    DETACH src;
    VACUUM;
  `);
  ship(out, `season-${season}`, manifest);
}

/**
 * Many DSV "SVG" logos are 1000-px PNGs wrapped in <image> tags, shown at
 * 24–60 px in the app. Scale every embedded bitmap down (best effort).
 */
function shrinkEmbeddedPng(svg, index) {
  let n = 0;
  return svg.replace(/data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)/g, (whole, type, b64) => {
    const ext = type === 'png' ? 'png' : 'jpg';
    const src = path.join(TMP_DIR, `logo-${index}-${n}.${ext}`);
    const dst = path.join(TMP_DIR, `logo-${index}-${n++}-small.${ext}`);
    try {
      fs.writeFileSync(src, Buffer.from(b64.replace(/\s+/g, ''), 'base64'));
      const res = spawnSync('sips', ['-Z', '160', src, '--out', dst], { encoding: 'utf8' });
      if (res.status !== 0 || !fs.existsSync(dst)) return whole;
      const small = fs.readFileSync(dst);
      return small.length < fs.statSync(src).size ? `data:image/${type};base64,${small.toString('base64')}` : whole;
    } catch {
      return whole;
    } finally {
      fs.rmSync(src, { force: true });
      fs.rmSync(dst, { force: true });
    }
  });
}

/** Pixel size of a PNG or JPEG buffer, or null. */
function bitmapSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Most uploaded logos are one bitmap in an SVG wrapper, and many wrappers
 * are broken: an <image> without width/height shows only its top-left
 * corner (a black or white box), office-export clip paths hide everything.
 * When the SVG draws nothing but that one bitmap, replace the wrapper with
 * a clean one at the bitmap's own size.
 */
function rewrapSingleBitmap(svg) {
  const images = [...svg.matchAll(/<image\b[^>]*?(?:xlink:)?href="(data:image\/(?:png|jpeg|jpg);base64,[^"]+)"[^>]*>/g)];
  if (images.length !== 1) return svg;
  const drawing = svg
    .replace(/<defs\b[\s\S]*?<\/defs>/gi, '')
    .replace(/<clipPath\b[\s\S]*?<\/clipPath>/gi, '')
    .replace(/<mask\b[\s\S]*?<\/mask>/gi, '');
  // Office exports put the bitmap into <defs> and draw it via <use>.
  const id = images[0][0].match(/\sid="([^"]+)"/)?.[1];
  const rest = id ? drawing.replace(new RegExp(`<use\\b[^>]*href="#${id}"[^>]*>(\\s*</use>)?`, 'g'), '') : drawing;
  if (/<(path|circle|ellipse|rect|polygon|polyline|line|text|use)\b/i.test(rest)) return svg;
  const href = images[0][1];
  const size = bitmapSize(Buffer.from(href.slice(href.indexOf(',') + 1), 'base64'));
  if (!size || !size.w || !size.h) return svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" width="${size.w}" height="${size.h}">` +
    `<image width="${size.w}" height="${size.h}" href="${href}"/></svg>`;
}

/**
 * Traced logos (imagetracer style) are drawn at the bitmap's pixel size but
 * declare width/height of ~25 px and no viewBox: only the white top-left
 * corner shows. Their first path is the full background rectangle, which
 * gives the real size; add the viewBox when its aspect ratio matches.
 */
function addMissingViewBox(svg) {
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!root || /\sviewBox=/i.test(root)) return svg;
  const w = parseFloat(root.match(/\swidth="([\d.]+)/)?.[1] ?? '');
  const h = parseFloat(root.match(/\sheight="([\d.]+)/)?.[1] ?? '');
  const d = svg.match(/<path\b[^>]*\sd="([^"]+)"/)?.[1];
  if (!w || !h || !d || !/^M\s*0[\s,]+0\b/.test(d)) return svg;
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  let maxX = 0, maxY = 0;
  nums.forEach((n, i) => { if (i % 2) maxY = Math.max(maxY, n); else maxX = Math.max(maxX, n); });
  if (maxX < w * 2 || maxY < h * 2) return svg;
  if (Math.abs(maxX / maxY - w / h) > 0.05 * (w / h)) return svg;
  return svg.replace(/<svg\b/, `<svg viewBox="0 0 ${maxX} ${maxY}"`);
}

/**
 * Illustrator exports carry their private editing data (i:aipgf, often
 * >100 KB) and a <foreignObject> inside a <switch>. A foreignObject taints
 * any canvas the image is drawn on, so the app could not trim the logo.
 */
function stripEditorData(svg) {
  return svg
    .replace(/<([\w-]+:)?foreignObject\b[\s\S]*?<\/\1?foreignObject>/g, '')
    .replace(/<i:(aipgf|pgf)\b[\s\S]*?<\/i:\1>/g, '')
    .replace(/<i:(aipgf|pgf)\b[^>]*\/>/g, '');
}

const KNOWN_NS = {
  xlink: 'http://www.w3.org/1999/xlink',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  cc: 'http://creativecommons.org/ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  inkscape: 'http://www.inkscape.org/namespaces/inkscape',
  sodipodi: 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
  sketch: 'http://www.bohemiancoding.com/sketch/ns',
  serif: 'http://www.serif.com/'
};

/**
 * Logos copied out of an HTML page lose their namespace declarations. As a
 * stand-alone .svg file that is invalid XML and the browser shows nothing.
 * Drop editor metadata (Inkscape, RDF) and declare every prefix still in use.
 */
function fixNamespaces(svg) {
  svg = svg
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '')
    // either <sodipodi:namedview …/> or <sodipodi:namedview …> … </sodipodi:namedview>
    .replace(/<sodipodi:namedview\b[^>]*?\/>/gi, '')
    .replace(/<sodipodi:namedview\b[^>]*>[\s\S]*?<\/sodipodi:namedview>/gi, '')
    .replace(/\s(?:inkscape|sodipodi):[\w.-]+="[^"]*"/g, '');
  if (!/<svg[^>]*\sxmlns=/.test(svg)) svg = svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const used = new Set([
    ...[...svg.matchAll(/<\/?([A-Za-z][\w.-]*):[\w.-]+/g)].map(m => m[1]),
    ...[...svg.matchAll(/\s([A-Za-z][\w.-]*):[\w.-]+\s*=/g)].map(m => m[1])
  ]);
  for (const prefix of used) {
    if (prefix === 'xml' || prefix === 'xmlns') continue;
    if (new RegExp(`xmlns:${prefix}=`).test(svg)) continue;
    const uri = KNOWN_NS[prefix] || `urn:x-unknown:${prefix}`;
    svg = svg.replace(/<svg\b/, `<svg xmlns:${prefix}="${uri}"`);
  }
  return svg;
}

/**
 * Upstream logos with a wrong viewBox: the drawing lies entirely outside it,
 * so they render empty. Real extent measured once with getBBox() in Chrome.
 */
const VIEWBOX_FIX = {
  svgaee72f8c27bd: [28.4, 28.3, 567, 567],
  svgcbba37db39c9: [127, 372.2, 500, 500]
};

function fixViewBox(svg, hash) {
  const box = VIEWBOX_FIX[hash];
  if (!box) return svg;
  return svg.replace(/<svg\b[^>]*>/, root => root
    .replace(/\s(viewBox|width|height)="[^"]*"/g, '')
    .replace(/<svg\b/, `<svg viewBox="${box.join(' ')}" width="${box[2]}" height="${box[3]}"`));
}

function buildLogos(manifest) {
  const rows = JSON.parse(sqlite(CORE, `.mode json
    SELECT hash, hex(base64(substr(data, 27))) AS hex FROM logos
    WHERE data LIKE 'data:image/svg+xml;base64,%'
      AND hash IN (SELECT logo_hash FROM table_entries WHERE logo_hash IS NOT NULL);`) || '[]');
  const canResize = spawnSync('sips', ['--version']).status === 0;
  if (!canResize) console.log('  (sips not available: embedded bitmaps are kept at full size)');

  // One static file per logo: the browser fetches only the logos that are
  // on screen, caches them like any image, and the host compresses the SVG.
  const dir = path.join(OUT_DIR, 'logos');
  fs.mkdirSync(dir, { recursive: true });
  let before = 0, after = 0;
  rows.forEach((row, i) => {
    let svg = Buffer.from(row.hex, 'hex').toString('utf8');
    before += svg.length;
    // The XML prolog declares utf-16, but the file is written as UTF-8.
    svg = svg.replace(/^\uFEFF?\s*<\?xml[^>]*\?>\s*/, '');
    // Make every logo a valid stand-alone SVG file: logos copied out of the
    // DSV page lack namespace declarations, some use "data:img/png".
    svg = svg.replace(/data:img\//g, 'data:image/');
    if (!/<svg[^>]*\sxmlns=/.test(svg)) svg = svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
    svg = stripEditorData(svg);
    svg = fixNamespaces(svg);
    if (canResize) svg = shrinkEmbeddedPng(svg, i);
    svg = rewrapSingleBitmap(svg);
    svg = addMissingViewBox(svg);
    svg = fixViewBox(svg, row.hash);
    after += svg.length;
    fs.writeFileSync(path.join(dir, `${row.hash}.svg`), svg);
  });
  manifest.logos = rows.length;
  console.log(`  logos/         ${rows.length} files, ${mb(before)} MB -> ${mb(after)} MB`);
}

/**
 * teams.json: every team of the most recent archived season with the leagues
 * it played in. The DSV publishes no team list for the running season, so the
 * app uses this to find a team by name and look for the league of the same
 * name in the current season.
 */
function buildTeamIndex(manifest) {
  const season = manifest.seasons[0];
  const rows = JSON.parse(sqlite(CORE, `.mode json
    SELECT DISTINCT x.team AS team, ${cleanText('l.name')} AS league
    FROM (
      SELECT league_id, team FROM table_entries
      UNION SELECT league_id, home_team FROM games
      UNION SELECT league_id, guest_team FROM games
    ) x JOIN leagues l ON l.id = x.league_id
    WHERE l.season_id = '${season}' AND x.team IS NOT NULL AND trim(x.team) != ''
    ORDER BY x.team;`) || '[]');
  const teams = {};
  for (const r of rows) (teams[r.team] ??= []).push(r.league);
  // Most recent archived logo of every team (all seasons): the app fills in
  // logos the liveticker or a league page does not provide.
  const logoRows = JSON.parse(sqlite(CORE, `.mode json
    SELECT te.team AS team, te.logo_hash AS hash
    FROM table_entries te JOIN leagues l ON l.id = te.league_id
    WHERE te.logo_hash IN (SELECT hash FROM logos WHERE data LIKE 'data:image/svg+xml;base64,%')
    ORDER BY l.season_id DESC;`) || '[]');
  const logos = {};
  for (const r of logoRows) logos[r.team] ??= r.hash;
  fs.writeFileSync(path.join(OUT_DIR, 'teams.json'), JSON.stringify({ season, teams, logos }));
  console.log(`  teams.json     ${Object.keys(teams).length} teams of season ${season}, ${Object.keys(logos).length} logos`);
}

/** Team side and cap per event exist only in data added by update-archive.js. */
let hasSideCols = false;

function buildDetails(season, manifest) {
  const out = fresh(`details-${season}`);
  const where = `game_id LIKE '${season}\\_%' ESCAPE '\\'`;
  const count = sqlite(DETAILS, `SELECT COUNT(*) FROM game_events WHERE ${where};`);
  sqlite(out, `
    PRAGMA page_size = 4096;
    PRAGMA journal_mode = OFF;
    ATTACH ${quote(DETAILS)} AS src;

    CREATE TABLE game_events(
      game_id TEXT, seq INTEGER, time TEXT, period INTEGER, home_score INTEGER, guest_score INTEGER,
      player TEXT, event_type TEXT, goal_number INTEGER, side TEXT, cap TEXT, PRIMARY KEY (game_id, seq)
    ) WITHOUT ROWID;
    INSERT INTO game_events
      SELECT game_id, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY id), time, period,
             home_score, guest_score, NULLIF(player, ''), event_type, goal_number, ${hasSideCols ? 'side, cap' : 'NULL, NULL'}
      FROM src.game_events WHERE ${where};

    CREATE TABLE game_lineups(
      game_id TEXT, seq INTEGER, team_side TEXT, number TEXT, name TEXT, birth_year TEXT,
      goals INTEGER, fouls_json TEXT, PRIMARY KEY (game_id, seq)
    ) WITHOUT ROWID;
    INSERT INTO game_lineups
      SELECT game_id, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY id), team_side, number, name,
             NULLIF(birth_year, ''), NULLIF(goals, 0), NULLIF(NULLIF(fouls_json, '[]'), '')
      FROM src.game_lineups WHERE ${where};

    CREATE TABLE game_officials(
      game_id TEXT, seq INTEGER, role TEXT, name TEXT, PRIMARY KEY (game_id, seq)
    ) WITHOUT ROWID;
    INSERT INTO game_officials
      SELECT game_id, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY id), role, name
      FROM src.game_officials WHERE ${where} AND name IS NOT NULL AND name != '';

    CREATE TABLE game_quarter_scores(
      game_id TEXT, quarter INTEGER, home_score INTEGER, guest_score INTEGER, PRIMARY KEY (game_id, quarter)
    ) WITHOUT ROWID;
    INSERT OR REPLACE INTO game_quarter_scores
      SELECT game_id, quarter, home_score, guest_score FROM src.game_quarter_scores WHERE ${where};

    CREATE TABLE game_team_details(
      game_id TEXT, team_side TEXT, coach TEXT, captain TEXT, team_leader TEXT,
      companion_leader TEXT, assistant TEXT, best_player TEXT, PRIMARY KEY (game_id, team_side)
    ) WITHOUT ROWID;
    INSERT OR REPLACE INTO game_team_details
      SELECT game_id, team_side, NULLIF(coach, ''), NULLIF(captain, ''), NULLIF(team_leader, ''),
             NULLIF(companion_leader, ''), NULLIF(assistant, ''), NULLIF(best_player, '')
      FROM src.game_team_details WHERE ${where};

    DETACH src;
    VACUUM;
  `);
  if (count === '0') {
    console.log(`  details-${season}: no events (skipped)`);
    return;
  }
  ship(out, `details-${season}`, manifest);
}

// ---------------------------------------------------------------------------

function main() {
  for (const p of [CORE, DETAILS]) {
    if (!fs.existsSync(p)) {
      console.error(`Missing source database: ${p}\nRun scrape-seasons.js and slim-db.js first.`);
      process.exit(1);
    }
  }
  if (LOGOS_ONLY) {
    const manifestPath = path.join(OUT_DIR, 'archive.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fs.rmSync(path.join(OUT_DIR, 'logos'), { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    buildTeamIndex(manifest);
    buildLogos(manifest);
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    return;
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const seasons = sqlite(CORE, 'SELECT DISTINCT season_id FROM leagues ORDER BY season_id DESC;')
    .split('\n').filter(Boolean);
  const manifest = { generated: new Date().toISOString(), seasons, files: {} };

  console.log(`Source: seasons.db ${mb(fs.statSync(CORE).size)} MB, details.db ${mb(fs.statSync(DETAILS).size)} MB`);
  console.log('Building archive files…');
  hasSideCols = /\|side\|/.test(sqlite(DETAILS, '.mode list\nPRAGMA table_info(game_events);').replace(/\n/g, '|') + '|');
  buildStats(manifest);
  buildTeamIndex(manifest);
  buildLogos(manifest);
  for (const season of seasons) buildSeason(season, manifest);
  for (const season of seasons) buildDetails(season, manifest);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT_DIR, 'archive.json'), JSON.stringify(manifest));

  const total = Object.values(manifest.files).reduce((n, f) => n + f.gzBytes, 0);
  const largest = Object.entries(manifest.files).sort((a, b) => b[1].gzBytes - a[1].gzBytes)[0];
  console.log(`Done: ${Object.keys(manifest.files).length} files, ${mb(total)} MB gzip in total; ` +
    `largest single download: ${largest[0]} (${mb(largest[1].gzBytes)} MB).`);
}

main();
