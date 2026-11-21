/**
 * Complete and repair the archive databases from the DSV website.
 *
 * What it fixes
 *   - Missing leagues: the official league list of every season (the "Saisons"
 *     tab on Index.aspx) is compared with the archive.
 *   - Leagues that were merged: DSV tells the rounds of one competition apart
 *     only by `LeagueKind` (V = Vorrunde, P = Playoffs, …). The old scraper keyed
 *     leagues by season + LeagueID + Group, so e.g. "Bundesliga Vorrunde" and
 *     "Bundesliga Playoffs" ended up as one league with mixed tables and games.
 *     Such leagues now get the kind in their id ("2025_298_V", "2025_298_P");
 *     all other league ids stay unchanged.
 *   - Games without result or report in seasons that were scraped while still
 *     running.
 *
 * How it works
 *   - Every DSV page is cached on disk (.cache/dsv/). A run can be interrupted at
 *     any time; the next run continues where it stopped without re-downloading.
 *   - One request at a time, 2–15 s apart (adapts to the server), with a long
 *     pause on HTTP 429/503.
 *   - Game reports already in details.db are reused when they provably belong
 *     to the game (same DSV GameID and kind, same result); only the rest is
 *     downloaded.
 *   - Uses Node's built-in SQLite (node:sqlite, Node 22.13+): no native packages.
 *   - Writes public/assets/data/seasons.db and details.db in place (back them up
 *     first; the script refuses to run without a backup in .cache/backup/).
 *
 * Usage
 *   node scripts/update-archive.js                 # plan only (no downloads)
 *   node scripts/update-archive.js --run           # complete everything that is incomplete
 *   node scripts/update-archive.js --run --season 2025      # one season, all leagues
 *   node scripts/update-archive.js --run --no-reports       # leagues only (results, tables, scorers)
 *   node scripts/update-archive.js --run --reports-only     # only the missing game reports
 *   node scripts/update-archive.js --run --reports-only --via-ticker
 *       Game data from the DSV liveticker (lizenz.dsv.de) instead of the report
 *       pages: play-by-play with team and cap, lineups with fouls, quarter
 *       scores — about 0.5 s per game instead of minutes, but without
 *       officials, staff and venue. Such games are marked
 *       details_source = 'ticker' and can be upgraded later without the flag.
 * Afterwards: node scripts/build-archive.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { JSDOM } = require('jsdom');
const { parseHtmlToGameDetails } = require('./parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public/assets/data');
const CACHE_DIR = path.join(ROOT, '.cache/dsv');
const BACKUP_DIR = path.join(ROOT, '.cache/backup');
const BASE = 'https://dsvdaten.dsv.de/Modules/WB/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const NO_REPORTS = args.includes('--no-reports');
const REPORTS_ONLY = args.includes('--reports-only');
const VIA_TICKER = args.includes('--via-ticker');
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || Infinity; // --limit N: only the first N reports (testing)
const ONLY_SEASONS = args.flatMap((a, i) => (a === '--season' ? [args[i + 1]] : []));

// Gap between requests. Adapts to the server: grows after every 429, shrinks
// slowly again after a run of successful requests.
let delayMs = 2500;
const MIN_DELAY = 2000, MAX_DELAY = 15000;
let streak = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = ms => Math.round(ms * (0.8 + Math.random() * 0.5));
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

// ---------------------------------------------------------------------------
// HTTP with disk cache and politeness
// ---------------------------------------------------------------------------

let lastRequest = 0;
let requests = 0;

async function politeFetch(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + jitter(delayMs) - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requests++;
    let res;
    try {
      res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': UA, Referer: 'https://dsvdaten.dsv.de/', ...(init.headers || {}) },
        signal: AbortSignal.timeout(60_000)
      });
    } catch (e) {
      if (attempt >= 5) throw new Error(`${url}: ${e.message}`);
      log(`  network error (${e.message}), retry ${attempt}/5 in ${attempt * 15}s`);
      await sleep(attempt * 15_000);
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`${url}: HTTP ${res.status} (giving up, run again later)`);
      streak = 0;
      delayMs = Math.min(MAX_DELAY, Math.round(delayMs * 1.5));
      const retryAfter = Number(res.headers.get('Retry-After')) || 0;
      const pause = Math.max(retryAfter * 1000, attempt * 60_000);
      log(`  HTTP ${res.status} – pausing ${pause / 1000}s, gap now ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/5)`);
      await sleep(pause);
      continue;
    }
    if (++streak >= 100 && delayMs > MIN_DELAY) {
      delayMs = Math.max(MIN_DELAY, Math.round(delayMs * 0.9));
      streak = 0;
    }
    return res;
  }
}

function cachePath(kind, key) {
  return path.join(CACHE_DIR, kind, key.replace(/[^\w.-]+/g, '_') + '.html.gz');
}

function readCache(kind, key) {
  const p = cachePath(kind, key);
  return fs.existsSync(p) ? zlib.gunzipSync(fs.readFileSync(p)).toString('utf8') : null;
}

function writeCache(kind, key, html) {
  const p = cachePath(kind, key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, zlib.gzipSync(html));
}

async function getPage(kind, relUrl) {
  const cached = readCache(kind, relUrl);
  if (cached !== null) return cached;
  if (!RUN) return null;
  let res, html;
  for (let attempt = 1; ; attempt++) {
    res = await politeFetch(BASE + relUrl);
    try {
      html = await res.text();
      break;
    } catch (e) {
      // The server sometimes drops the connection mid-answer ("terminated").
      if (attempt >= 4) throw new Error(`${relUrl}: ${e.message}`);
      log(`  connection dropped (${e.message}), retry ${attempt}/3 in ${attempt * 20}s`);
      await sleep(attempt * 20_000);
    }
  }
  // DSV answers unknown pages with a redirect to Index.aspx.
  if (res.status !== 200 || /<title>Object moved<\/title>/i.test(html)) throw new Error(`${relUrl}: unexpected answer (${res.status})`);
  writeCache(kind, relUrl, html);
  return html;
}

// ---------------------------------------------------------------------------
// League lists (Index.aspx → tab "Saisons" → season dropdown postback)
// ---------------------------------------------------------------------------

let indexForm = null;

async function leagueList(season) {
  const key = `season-${season}`;
  const cached = readCache('lists', key);
  if (cached !== null) return JSON.parse(cached);

  if (!indexForm) {
    const res = await politeFetch(BASE + 'Index.aspx');
    const html = await res.text();
    const field = n => (html.match(new RegExp(`id="${n}" value="([^"]*)"`)) || [])[1] || '';
    indexForm = {
      cookie: (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; '),
      fields: {
        __VIEWSTATE: field('__VIEWSTATE'),
        __VIEWSTATEGENERATOR: field('__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: field('__EVENTVALIDATION')
      },
      liveSeason: (html.match(/id="active"[\s\S]*?League\.aspx\?Season=(\d{4})/) || [])[1]
    };
  }
  const body = new URLSearchParams({
    __EVENTTARGET: 'ctl00$ContentSection$_seasonDropDownList',
    __EVENTARGUMENT: '',
    ...indexForm.fields,
    'ctl00$ContentSection$_seasonDropDownList': String(season),
    'ctl00$ContentSection$hiddenTab': '#seasontab'
  });
  const res = await politeFetch(BASE + 'Index.aspx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: indexForm.cookie, Referer: BASE + 'Index.aspx' },
    body
  });
  const html = await res.text();
  const section = html.slice(html.indexOf('ContentSection_season_container'));
  const leagues = [...section.matchAll(/href='(League\.aspx\?[^']+)'>([^<]*)</g)].map(([, href, name]) => {
    const link = href.replace(/&amp;/g, '&');
    const q = new URL(link, BASE).searchParams;
    return {
      link,
      name: name.replace(/\s+/g, ' ').trim(),
      season: q.get('Season'),
      leagueId: q.get('LeagueID'),
      group: q.get('Group') || '',
      kind: q.get('LeagueKind') || ''
    };
  });
  if (!leagues.length) throw new Error(`No leagues listed for season ${season}`);
  writeCache('lists', key, JSON.stringify(leagues));
  return leagues;
}

/** League ids: as before, plus the kind where one LeagueID/Group has several kinds. */
function assignIds(leagues) {
  const base = l => `${l.season}_${l.leagueId}${l.group ? '_' + l.group : ''}`;
  const count = new Map();
  for (const l of leagues) count.set(base(l), (count.get(base(l)) || 0) + 1);
  for (const l of leagues) {
    l.baseId = base(l);
    l.merged = count.get(l.baseId) > 1;
    l.id = l.merged ? `${l.baseId}_${l.kind}` : l.baseId;
  }
  return leagues;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

function sectionTable(doc, containerId, labelId) {
  const container = doc.getElementById(containerId);
  if (container) return container.tagName === 'TABLE' ? container : container.querySelector('table');
  let parent = doc.getElementById(labelId)?.parentElement || null;
  while (parent && !parent.classList.contains('card-header')) parent = parent.parentElement;
  return parent?.nextElementSibling?.querySelector('table') || null;
}

function svgLogo(cell) {
  const svg = cell?.querySelector('svg');
  if (svg) return svg.outerHTML;
  const src = cell?.querySelector('img')?.getAttribute('src') || '';
  if (src.startsWith('data:image/svg+xml;base64,')) return Buffer.from(src.slice(26), 'base64').toString('utf8');
  return null;
}

function parseLeaguePage(html) {
  html = html.replace(/<\/?nobr>/g, '');
  const doc = new JSDOM(html).window.document;
  const games = [];
  const gameTable = sectionTable(doc, 'games', 'ContentSection__roundLabel');
  let round = '';
  for (const row of gameTable ? [...gameTable.querySelectorAll('tr')].slice(1) : []) {
    const cells = row.querySelectorAll('td');
    if (!cells.length) {
      const heading = text(row.querySelector('th[colspan]'));
      if (heading) round = heading;
      continue;
    }
    if (cells.length < 6) continue;
    const modern = cells.length >= 8;
    const resultCell = cells[modern ? 7 : 5];
    let result = text(resultCell);
    if (result === 'mehr...') result = ' - ';
    const href = resultCell.querySelector('a')?.getAttribute('href') || '';
    games.push({
      number: text(cells[0]),
      start: text(cells[1]),
      home: text(cells[modern ? 3 : 2]),
      guest: text(cells[modern ? 5 : 3]),
      location: text(cells[modern ? 6 : 4]),
      result,
      link: href.replace(/^https?:\/\/dsvdaten\.dsv\.de\/Modules\/WB\//, ''),
      round
    });
  }

  const table = [];
  const tableEl = sectionTable(doc, 'table', 'ContentSection__tableLabel');
  for (const row of tableEl ? [...tableEl.querySelectorAll('tr')].slice(1) : []) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 10) continue;
    const [team, ...info] = text(cells[2]).split(' - ');
    const goals = text(cells[7]);
    const [gf, ga] = goals.split(':').map(n => parseInt(n, 10));
    table.push({
      place: parseInt(text(cells[0]), 10) || null,
      team: team.trim(),
      info: info.join(' - ').trim(),
      logo: svgLogo(cells[1]),
      games: parseInt(text(cells[3]).split('/')[0], 10) || 0,
      wins: parseInt(text(cells[4]), 10) || 0,
      draws: parseInt(text(cells[5]), 10) || 0,
      losses: parseInt(text(cells[6]), 10) || 0,
      goals,
      goalsFor: Number.isNaN(gf) ? null : gf,
      goalsAgainst: Number.isNaN(ga) ? null : ga,
      goalDiff: parseInt(text(cells[8]).replace('+', ''), 10) || 0,
      points: parseInt(text(cells[9]), 10) || 0
    });
  }

  const scorers = [];
  const scorerEl = sectionTable(doc, 'scorer', 'ContentSection__scorerLabel');
  let place = 0;
  for (const row of scorerEl ? [...scorerEl.querySelectorAll('tr')].slice(1) : []) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) continue;
    const p = parseInt(text(cells[0]), 10);
    if (!Number.isNaN(p)) place = p;
    const hasYear = cells.length > 5;
    scorers.push({
      place,
      name: text(cells[1]),
      team: text(cells[2]),
      birthYear: hasYear ? text(cells[3]) : '',
      goals: parseInt(text(cells[hasYear ? 4 : 3]), 10) || 0,
      games: parseInt(text(cells[hasYear ? 5 : 4]), 10) || 0
    });
  }
  return { games, table, scorers };
}

function parseScore(result) {
  const m = (result || '').match(/^\s*(\d+)\s*:\s*(\d+)/);
  if (!m) return { home_score: null, guest_score: null, goal_difference: null, total_goals: null };
  const h = +m[1], g = +m[2];
  return { home_score: h, guest_score: g, goal_difference: h - g, total_goals: h + g };
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function parseDate(start) {
  const empty = { date_iso: null, time_iso: null, datetime_iso: null, start_year: null, start_month: null, start_month_name: null, start_day: null, start_hour: null, start_minute: null, start_day_of_week: null };
  const m = (start || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return empty;
  let year = +m[3];
  if (year < 100) year += 2000;
  const month = +m[2], day = +m[1];
  const pad = n => String(n).padStart(2, '0');
  const date = new Date(year, month - 1, day, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return {
    date_iso: `${year}-${pad(month)}-${pad(day)}`,
    time_iso: m[4] ? `${pad(+m[4])}:${m[5]}` : null,
    datetime_iso: m[4] ? date.toISOString() : null,
    start_year: year, start_month: month, start_month_name: MONTHS[month - 1], start_day: day,
    start_hour: m[4] ? +m[4] : null, start_minute: m[5] ? +m[5] : null,
    start_day_of_week: DAYS[date.getDay()]
  };
}

function parsePlayer(raw) {
  const m = (raw || '').match(/^(.*?)\s*\((\d{4})\)\s*$/);
  return m ? { name: m[1].trim(), birthYear: +m[2] } : { name: (raw || '').trim(), birthYear: null };
}

/** node:sqlite does not accept `undefined`: turn it into NULL. */
const nullify = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v]));

const gameIdFromLink = link => (link.match(/GameID=(\d+)/i) || [])[1] || null;
const kindFromLink = link => (link.match(/LeagueKind=([A-Za-z]+)/i) || [])[1] || '';

// ---------------------------------------------------------------------------
// DSV liveticker (SignalR 2.x hub "wbhub" on lizenz.dsv.de, longPolling)
// ---------------------------------------------------------------------------

const TICKER = 'https://lizenz.dsv.de/signalr';
const TICKER_HEADERS = { 'User-Agent': UA, Referer: 'https://lizenz.dsv.de/Live.aspx', Accept: 'application/json' };
let tickerToken = null;
let tickerInvocation = 0;
let tickerGap = 700;
let tickerLast = 0;

function tickerUrl(action, extra = {}) {
  const q = new URLSearchParams({ clientProtocol: '2.1', connectionData: JSON.stringify([{ name: 'wbhub' }]), ...extra });
  if (tickerToken) q.set('connectionToken', tickerToken);
  return `${TICKER}/${action}?${q}`;
}

async function tickerConnect() {
  const neg = await (await fetch(tickerUrl('negotiate'), { headers: TICKER_HEADERS, signal: AbortSignal.timeout(30_000) })).json();
  tickerToken = neg.ConnectionToken;
  await (await fetch(tickerUrl('connect', { transport: 'longPolling' }), { headers: TICKER_HEADERS, signal: AbortSignal.timeout(30_000) })).text();
  await fetch(tickerUrl('start', { transport: 'longPolling' }), { headers: TICKER_HEADERS, signal: AbortSignal.timeout(30_000) });
}

async function tickerCall(method, args) {
  for (let attempt = 1; ; attempt++) {
    const wait = tickerLast + jitter(tickerGap) - Date.now();
    if (wait > 0) await sleep(wait);
    tickerLast = Date.now();
    try {
      if (!tickerToken) await tickerConnect();
      requests++;
      const res = await fetch(tickerUrl('send', { transport: 'longPolling' }), {
        method: 'POST',
        headers: { ...TICKER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: JSON.stringify({ H: 'wbhub', M: method, A: args, I: tickerInvocation++ }) }),
        signal: AbortSignal.timeout(60_000)
      });
      if (res.status === 429 || res.status >= 500) {
        tickerGap = Math.min(10_000, Math.round(tickerGap * 1.5));
        throw new Error(`HTTP ${res.status}`);
      }
      const body = JSON.parse(await res.text());
      if (body.E) throw new Error(body.E);
      return body.R ?? [];
    } catch (e) {
      tickerToken = null; // reconnect on the next attempt
      if (attempt >= 5) throw new Error(`ticker ${method}: ${e.message}`);
      log(`  ticker ${method} failed (${e.message}), retry ${attempt}/5 in ${attempt * 20}s`);
      await sleep(attempt * 20_000);
    }
  }
}

/** Ticker data of one game, cached like the HTML pages. */
async function tickerGame(gameId, link) {
  const cached = readCache('ticker', gameId);
  if (cached !== null) return JSON.parse(cached);
  const q = new URL(link, BASE).searchParams;
  const ref = [Number(q.get('Season')), Number(q.get('LeagueID')), q.get('Group') || '', q.get('LeagueKind') || '', Number(q.get('GameID'))];
  const plan = await tickerCall('getGamePlan', [...ref, '', 0, '', 0]);
  const stats = await tickerCall('getGameStats', ref);
  // Keep only what we use: the raw rows carry ~200 empty fields each.
  const pick = (rows, keys) => (rows || []).map(r => Object.fromEntries(keys.map(k => [k, r[k]])));
  const data = {
    plan: pick(plan, ['Number', 'Period', 'EventTime', 'EventKey', 'EventCode', 'EventName', 'GamePlanHome', 'GamePlanGuest', 'GamePlanPlayer', 'LiveGoals', 'Active']),
    stats: pick(stats, ['HomeClubname', 'GuestClubname', 'Cap', 'FirstName', 'LastName', 'Born', 'TotalGoalsOwn', 'Error1', 'Error2', 'Error3', 'Error4', 'Error5'])
  };
  writeCache('ticker', gameId, JSON.stringify(data));
  return data;
}

/** Convert ticker data into the structure writeReport() stores. */
function tickerToDetails({ plan, stats }) {
  const plays = plan.filter(p => p.Active !== false).sort((a, b) => a.Number - b.Number);
  if (!plays.length && !stats.length) return null;

  let h = 0, g = 0;
  const events = [];
  const quarters = new Map();
  for (const p of plays) {
    const side = p.GamePlanHome ? 'home' : p.GamePlanGuest ? 'guest' : null;
    const capRaw = String(p.GamePlanHome || p.GamePlanGuest || '');
    const code = p.EventCode || p.EventKey || '';
    const goal = code === 'T';
    const m = (p.LiveGoals || '').match(/(\d+)\s*:\s*(\d+)/);
    if (goal && m) { h = +m[1]; g = +m[2]; }
    if (goal && side && p.Period >= 1) {
      const q = quarters.get(p.Period) || { home: 0, guest: 0 };
      q[side]++;
      quarters.set(p.Period, q);
    }
    // "1900-01-01T00:02:54" -> "2:54" (time left in the period, as in the report)
    const t = (p.EventTime || '').split('T')[1] || '';
    const [hh, mm, ss] = t.split(':').map(Number);
    events.push({
      time: Number.isNaN(mm) ? '' : `${(hh || 0) * 60 + mm}:${String(ss).padStart(2, '0')}`,
      period: p.Period ?? null,
      homeScore: h,
      guestScore: g,
      player: p.GamePlanPlayer || null,
      eventType: code,
      goalNumber: goal ? h + g : null,
      side,
      cap: /^\d+$/.test(capRaw) ? capRaw : null
    });
  }
  for (let q = 1; q <= 4; q++) if (!quarters.has(q) && plays.some(p => p.Period >= q)) quarters.set(q, { home: 0, guest: 0 });

  const team = which => ({
    players: stats
      .filter(r => (which === 'home' ? r.HomeClubname : r.GuestClubname))
      .sort((a, b) => (a.Cap ?? 99) - (b.Cap ?? 99))
      .map(r => ({
        number: r.Cap != null ? String(r.Cap) : '',
        name: [r.LastName, r.FirstName].filter(Boolean).join(', '),
        birthYear: r.Born && !r.Born.startsWith('0001') ? r.Born.slice(0, 4) : '',
        goals: r.TotalGoalsOwn || 0,
        fouls: [1, 2, 3, 4, 5].filter(i => r[`Error${i}`]).map(i => ({ quarter: i, foulType: r[`Error${i}`] }))
      }))
  });

  return {
    source: 'ticker',
    events,
    quarterScores: [...quarters.entries()].sort((a, b) => a[0] - b[0]).map(([quarter, q]) => ({ quarter, home: q.home, guest: q.guest })),
    officials: {},
    homeTeam: team('home'),
    guestTeam: team('guest')
  };
}

// ---------------------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------------------

/** Run fn inside one transaction (node:sqlite has no helper for it). */
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function openDbs() {
  const core = new DatabaseSync(path.join(DATA_DIR, 'seasons.db'));
  const details = new DatabaseSync(path.join(DATA_DIR, 'details.db'));
  for (const db of [core, details]) db.exec('PRAGMA journal_mode = DELETE');
  // Columns added over time (team side and cap of an event; origin of a report).
  const addColumn = (db, table, col, type) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  };
  addColumn(details, 'game_events', 'side', 'TEXT');
  addColumn(details, 'game_events', 'cap', 'TEXT');
  addColumn(core, 'games', 'details_source', 'TEXT');
  details.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_lineups_game_id ON game_lineups(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_officials_game_id ON game_officials(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_quarter_scores_game_id ON game_quarter_scores(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_team_details_game_id ON game_team_details(game_id);
  `);
  return { core, details };
}

const DETAIL_TABLES = ['game_events', 'game_lineups', 'game_officials', 'game_quarter_scores', 'game_team_details'];

/**
 * Replace the given archive leagues by freshly parsed data. Returns the games
 * that still need a report.
 */
function writeLeagues(dbs, season, items, oldIds) {
  const { core, details } = dbs;
  const teamId = (() => {
    const ins = core.prepare('INSERT OR IGNORE INTO teams (name) VALUES (?)');
    const get = core.prepare('SELECT id FROM teams WHERE name = ?');
    return name => (name ? (ins.run(name), get.get(name).id) : null);
  })();
  const playerId = (() => {
    const get = core.prepare('SELECT id FROM players WHERE name = ? AND birth_year IS ?');
    const ins = core.prepare('INSERT INTO players (name, birth_year) VALUES (?, ?)');
    return (name, year) => (name ? (get.get(name, year ?? null)?.id ?? Number(ins.run(name, year ?? null).lastInsertRowid)) : null);
  })();
  const logoHash = (() => {
    const ins = core.prepare('INSERT OR IGNORE INTO logos (hash, data) VALUES (?, ?)');
    return svg => {
      if (!svg) return null;
      const hash = 'svg' + crypto.createHash('sha1').update(svg).digest('hex').slice(0, 12);
      ins.run(hash, 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64'));
      return hash;
    };
  })();

  const allIds = [...new Set([...oldIds, ...items.map(i => i.league.id)])];
  const ph = allIds.map(() => '?').join(',');
  // Previous state of these games, to reuse reports that still fit.
  const oldGames = core.prepare(`SELECT id, league_id, link_url, result, is_details_processed FROM games WHERE league_id IN (${ph})`).all(...allIds);
  const oldByKey = new Map();
  for (const g of oldGames) {
    const gid = gameIdFromLink(g.link_url || '');
    if (!gid) continue;
    oldByKey.set(`${g.league_id}|${kindFromLink(g.link_url)}|${gid}`, g);
    oldByKey.set(`${g.league_id}|*|${gid}`, oldByKey.get(`${g.league_id}|*|${gid}`) || g);
  }

  const needReport = [];
  const reused = new Map(); // old game id -> new game id

  const insertLeague = core.prepare(`INSERT INTO leagues (id, season_id, original_id, name, link_url, is_processed) VALUES (?, ?, ?, ?, ?, 1)`);
  const insertGame = core.prepare(`INSERT INTO games (
      id, league_id, game_id_dsv, start_time, home_team, guest_team, location, result, link_url, is_details_processed,
      home_score, guest_score, goal_difference, total_goals, date_iso, time_iso, datetime_iso, start_year, start_month,
      start_month_name, start_day, start_hour, start_minute, start_day_of_week, home_team_id, guest_team_id)
    VALUES (@id, @league_id, @game_id_dsv, @start_time, @home_team, @guest_team, @location, @result, @link_url, 0,
      @home_score, @guest_score, @goal_difference, @total_goals, @date_iso, @time_iso, @datetime_iso, @start_year, @start_month,
      @start_month_name, @start_day, @start_hour, @start_minute, @start_day_of_week, @home_team_id, @guest_team_id)`);
  const copyDetailColsSql = `UPDATE games SET (is_details_processed, play_kind, final_score, scoring_system, end_time,
      organizer, notes, video_link, protocol_link, pool_name, pool_city, google_maps_link, venue_id) =
      (SELECT 1, play_kind, final_score, scoring_system, end_time, organizer, notes, video_link, protocol_link, pool_name,
              pool_city, google_maps_link, venue_id FROM old_games WHERE id = ?) WHERE id = ?`;
  const insertTable = core.prepare(`INSERT INTO table_entries (id, league_id, place, team, games_played, wins, draws, losses,
      goals, goal_diff, points, info, image_url, goals_for, goals_against, logo_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`);
  const insertScorer = core.prepare(`INSERT OR REPLACE INTO scorers (id, league_id, place, name, team, birth_year, goals, games,
      player_name, player_birth_year, player_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  transaction(core, () => {
    core.exec('DROP TABLE IF EXISTS temp.old_games');
    core.prepare(`CREATE TEMP TABLE old_games AS SELECT * FROM games WHERE league_id IN (${ph})`).run(...allIds);
    const copyDetailCols = core.prepare(copyDetailColsSql);
    for (const t of ['games', 'table_entries', 'scorers', 'leagues']) {
      core.prepare(`DELETE FROM ${t} WHERE ${t === 'leagues' ? 'id' : 'league_id'} IN (${ph})`).run(...allIds);
    }
    core.prepare('INSERT OR IGNORE INTO seasons (id, name) VALUES (?, ?)').run(season, `Saison ${season}`);

    for (const { league, page } of items) {
      insertLeague.run(league.id, season, league.leagueId, league.name, league.link);

      const seen = new Set();
      page.games.forEach((g, index) => {
        const dsvId = gameIdFromLink(g.link);
        let id = dsvId ? `${league.id}_${dsvId}` : `${league.id}_idx${index}`;
        if (seen.has(id)) id = `${id}_${index}`;
        seen.add(id);
        insertGame.run(nullify({
          id, league_id: league.id, game_id_dsv: dsvId, start_time: g.start, home_team: g.home, guest_team: g.guest,
          location: g.location, result: g.result, link_url: g.link,
          ...parseScore(g.result), ...parseDate(g.start),
          home_team_id: teamId(g.home), guest_team_id: teamId(g.guest)
        }));
        if (!dsvId) return;

        // A stored report fits if it was fetched from this very game (same
        // DSV GameID, and the same kind for formerly merged leagues) and the
        // result has not changed since.
        // Already split in an earlier run: stored under the new id. Otherwise
        // under the shared old id, from the link of the same kind.
        const old = oldByKey.get(`${league.id}|${league.kind}|${dsvId}`)
          || oldByKey.get(`${league.id}|*|${dsvId}`)
          || (league.merged ? oldByKey.get(`${league.baseId}|${league.kind}|${dsvId}`) : null);
        const sameResult = old && (old.result || '').trim() === (g.result || '').trim();
        if (old && old.is_details_processed && sameResult) {
          copyDetailCols.run(old.id, id);
          if (old.id !== id) reused.set(old.id, id);
          else reused.set(old.id, old.id);
        } else if (parseScore(g.result).home_score !== null) {
          needReport.push({ id, link: g.link });
        }
      });

      page.table.forEach((t, i) => {
        insertTable.run(`${league.id}_${t.team}`, league.id, t.place, t.team, t.games, t.wins, t.draws, t.losses,
          t.goals, t.goalDiff, t.points, t.info || null, t.goalsFor, t.goalsAgainst, logoHash(t.logo));
      });

      for (const s of page.scorers) {
        const p = parsePlayer(s.name);
        insertScorer.run(`${league.id}_${s.name}_${s.team}`, league.id, s.place, s.name, s.team, s.birthYear || null,
          s.goals, s.games, p.name, p.birthYear, playerId(p.name, p.birthYear));
      }
    }
    core.exec('DROP TABLE temp.old_games');
  });

  // Reports: keep (and re-key) the reused ones, drop everything else of the old games.
  transaction(details, () => {
    for (const t of DETAIL_TABLES) {
      const rename = details.prepare(`UPDATE ${t} SET game_id = ? WHERE game_id = ?`);
      const drop = details.prepare(`DELETE FROM ${t} WHERE game_id = ?`);
      for (const g of oldGames) {
        const target = reused.get(g.id);
        if (target === undefined) drop.run(g.id);
        else if (target !== g.id) rename.run(target, g.id);
      }
    }
  });

  return { needReport, reused: reused.size };
}

function writeReport(dbs, gameId, d) {
  const { core, details } = dbs;
  const nextId = {};
  for (const t of DETAIL_TABLES) nextId[t] = (details.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM ${t}`).get().m) + 1;
  const id = t => nextId[t]++;
  const clean = v => (v && String(v).trim() ? String(v).trim() : null);

  transaction(details, () => {
    for (const t of DETAIL_TABLES) details.prepare(`DELETE FROM ${t} WHERE game_id = ?`).run(gameId);
    const q = details.prepare('INSERT INTO game_quarter_scores (id, game_id, quarter, home_score, guest_score) VALUES (?, ?, ?, ?, ?)');
    for (const s of d.quarterScores || []) q.run(id('game_quarter_scores'), gameId, s.quarter ?? null, s.home ?? null, s.guest ?? null);
    const o = details.prepare('INSERT INTO game_officials (id, game_id, role, name) VALUES (?, ?, ?, ?)');
    for (const [role, name] of Object.entries(d.officials || {})) if (clean(name)) o.run(id('game_officials'), gameId, role, clean(name));
    const e = details.prepare('INSERT INTO game_events (id, game_id, time, period, home_score, guest_score, player, event_type, goal_number, side, cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const ev of d.events || []) e.run(id('game_events'), gameId, ev.time ?? null, ev.period ?? null, ev.homeScore ?? null, ev.guestScore ?? null, ev.player || null, ev.eventType || null, ev.goalNumber ?? null, ev.side ?? null, ev.cap ?? null);
    const td = details.prepare('INSERT INTO game_team_details (id, game_id, team_side, coach, captain, team_leader, companion_leader, assistant, best_player) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const l = details.prepare('INSERT INTO game_lineups (id, game_id, team_side, number, name, birth_year, goals, fouls_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const [side, team] of [['home', d.homeTeam], ['guest', d.guestTeam]]) {
      if (!team) continue;
      const staff = [team.coach, team.captain, team.teamLeader, team.companionLeader, team.assistant, team.bestPlayer].map(clean);
      if (staff.some(Boolean)) td.run(id('game_team_details'), gameId, side, ...staff);
      for (const p of team.players || []) {
        l.run(id('game_lineups'), gameId, side, p.number ?? null, p.name ?? null, p.birthYear || null, p.goals || 0, JSON.stringify(p.fouls || []));
      }
    }
  });

  const http = v => (v && /^https?:\/\//i.test(v) ? v : null);
  if (d.source === 'ticker') {
    // Ticker data has no officials, staff or venue: keep what the game row has.
    core.prepare(`UPDATE games SET is_details_processed = 1, details_source = 'ticker', final_score = COALESCE(final_score, result) WHERE id = ?`).run(gameId);
    return;
  }
  core.prepare(`UPDATE games SET is_details_processed = 1, details_source = 'report', play_kind = ?, final_score = ?, scoring_system = ?, end_time = ?,
      organizer = ?, notes = ?, video_link = ?, protocol_link = ?, pool_name = ?, pool_city = ?, google_maps_link = ?
    WHERE id = ?`).run(clean(d.playKind), clean(d.finalScore), clean(d.scoringSystem), clean(d.endGameTime), clean(d.organizer),
    clean(d.notes), http(d.videoLink), http(d.protocolLink), clean(d.venue?.poolName), clean(d.venue?.poolCity),
    http(d.venue?.googleMapsLink), gameId);
}

// ---------------------------------------------------------------------------

async function main() {
  if (RUN && !(fs.existsSync(path.join(BACKUP_DIR, 'seasons.db')) && fs.existsSync(path.join(BACKUP_DIR, 'details.db')))) {
    console.error(`Back up the databases first: cp public/assets/data/{seasons,details}.db ${path.relative(ROOT, BACKUP_DIR)}/`);
    process.exit(1);
  }
  const dbs = openDbs();
  const archived = new Set(dbs.core.prepare('SELECT id FROM leagues').all().map(r => r.id));
  const seasonsInDb = dbs.core.prepare('SELECT DISTINCT season_id AS s FROM leagues ORDER BY s').all().map(r => r.s);

  // 1. Official league lists
  const seasons = ONLY_SEASONS.length ? ONLY_SEASONS
    : [...new Set([...seasonsInDb, String(Math.max(...seasonsInDb.map(Number)) + 1)])];
  const lists = {};
  const nowDate = new Date();
  const runningSeason = nowDate.getMonth() >= 7 ? nowDate.getFullYear() : nowDate.getFullYear() - 1;
  for (const s of seasons.filter(x => Number(x) < runningSeason)) {
    try {
      lists[s] = assignIds(await leagueList(s));
    } catch (e) {
      if (!RUN) { log(`Season ${s}: league list not cached yet (run with --run).`); continue; }
      throw e;
    }
  }
  // The running season is served live by the app and never archived. A season
  // starts in August (same rule as SeasonService.seasonForDate in the app).
  const now = new Date();
  const live = String(indexForm?.liveSeason || (now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1));

  // 2. Plan
  const plan = [];
  for (const [s, leagues] of Object.entries(lists)) {
    if (Number(s) >= Number(live)) { log(`Season ${s} is the running season (served live) – skipped.`); continue; }
    const missing = leagues.filter(l => !archived.has(l.id) && !archived.has(l.baseId));
    const merged = leagues.filter(l => l.merged);
    const archivedOfSeason = dbs.core.prepare('SELECT COUNT(*) AS n FROM leagues WHERE season_id = ?').get(s).n;
    const openResults = dbs.core.prepare(`SELECT COUNT(*) AS n FROM games g JOIN leagues l ON l.id = g.league_id
      WHERE l.season_id = ? AND g.home_score IS NULL AND g.date_iso < date('now', '-14 days')`).get(s).n;
    const gamesOfSeason = dbs.core.prepare(`SELECT COUNT(*) AS n FROM games g JOIN leagues l ON l.id = g.league_id
      WHERE l.season_id = ?`).get(s).n;
    // A season scraped while it was running: a large share of past games has no
    // result. (A few open games are normal: cancelled or forfeited.)
    const stale = ONLY_SEASONS.includes(s) || openResults > gamesOfSeason * 0.25;
    const todo = stale ? leagues : [...new Map([...missing, ...merged].map(l => [l.id, l])).values()];
    log(`Season ${s}: DSV ${leagues.length}, archive ${archivedOfSeason}, missing ${missing.length}, merged ${merged.length}, ` +
      `open results ${openResults} -> ${todo.length} league pages${stale ? ' (whole season)' : ''}`);
    if (todo.length) plan.push({ season: s, leagues: todo });
  }
  // Newest season first: it usually has the biggest gaps.
  plan.sort((a, b) => Number(b.season) - Number(a.season));
  const pages = plan.reduce((n, p) => n + p.leagues.length, 0);
  log(`Plan: ${pages} league pages${NO_REPORTS ? '' : ' + the game reports they need'}.`);
  if (!RUN) { log('Dry run. Start with --run.'); return; }

  // 3. League pages, season by season
  let reportQueue = [];
  for (const { season, leagues } of REPORTS_ONLY ? [] : plan) {
    const items = [];
    for (const [i, league] of leagues.entries()) {
      const html = await getPage(`league/${season}`, league.link);
      items.push({ league, page: parseLeaguePage(html) });
      if ((i + 1) % 20 === 0 || i === leagues.length - 1) log(`  ${season}: ${i + 1}/${leagues.length} league pages (${requests} requests)`);
    }
    // Old rows to replace: the leagues' own ids and, for merged ones, the shared old id.
    const oldIds = [...new Set(leagues.flatMap(l => [l.id, l.baseId]))].filter(id => archived.has(id));
    const { needReport, reused } = writeLeagues(dbs, season, items, oldIds);
    const games = items.reduce((n, i) => n + i.page.games.length, 0);
    log(`  ${season}: wrote ${items.length} leagues, ${games} games; reused ${reused} reports, ${needReport.length} reports to fetch`);
    reportQueue.push(...needReport);
  }

  // Older runs may have left reports open (interrupted): pick those up as well.
  // With --reports-only: every played archive game that has no report yet.
  const reportSeasons = REPORTS_ONLY ? Object.keys(lists).filter(s => s !== live) : plan.map(p => p.season);
  const open = dbs.core.prepare(`SELECT g.id, g.link_url AS link FROM games g JOIN leagues l ON l.id = g.league_id
    WHERE g.is_details_processed = 0 AND g.home_score IS NOT NULL AND g.link_url LIKE 'Game.aspx%'
      AND l.season_id IN (${reportSeasons.map(() => '?').join(',') || "''"})
    ORDER BY l.season_id DESC`).all(...reportSeasons);
  reportQueue = [...new Map([...reportQueue, ...open].map(r => [r.id, r])).values()].slice(0, LIMIT);

  // 4. Game reports
  if (NO_REPORTS) { log(`Skipping ${reportQueue.length} reports (--no-reports).`); return; }
  log(`Fetching ${reportQueue.length} game reports${VIA_TICKER ? ' from the liveticker' : ''}…`);
  let failed = 0, empty = 0;
  for (const [i, r] of reportQueue.entries()) {
    try {
      if (VIA_TICKER) {
        const d = tickerToDetails(await tickerGame(r.id, r.link));
        if (d) writeReport(dbs, r.id, d);
        else empty++; // the ticker has nothing for this game: leave it for the report pages
      } else {
        const html = await getPage(`game/${r.id.slice(0, 4)}`, r.link);
        const d = parseHtmlToGameDetails(html);
        if (d) writeReport(dbs, r.id, d);
      }
    } catch (e) {
      failed++;
      log(`  report ${r.id} failed: ${e.message}`);
      if (/giving up/.test(e.message)) throw e;
    }
    if ((i + 1) % 50 === 0 || i === reportQueue.length - 1) log(`  ${i + 1}/${reportQueue.length} reports (${requests} requests, ${failed} failed${VIA_TICKER ? `, ${empty} without ticker data` : ''})`);
  }
  log(`Done. ${requests} requests in total. Next: node scripts/build-archive.js`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
