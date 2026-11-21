const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../public/assets/data/seasons.db');

function initDB() {
  fs.ensureDirSync(path.dirname(DB_PATH));
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY, -- "2025"
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY, -- "2025_196"
      season_id TEXT,
      original_id INTEGER,
      name TEXT,
      link_url TEXT,
      is_processed BOOLEAN DEFAULT 0,
      FOREIGN KEY(season_id) REFERENCES seasons(id)
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, -- "2025_196_21" or constructed
      league_id TEXT,
      game_id_dsv INTEGER,
      start_time TEXT,
      home_team TEXT,
      guest_team TEXT,
      location TEXT,
      result TEXT,
      link_url TEXT,

      -- Structured Score Fields (for analysis)
      home_score INTEGER,
      guest_score INTEGER,
      goal_difference INTEGER,
      total_goals INTEGER,

      -- Structured Date Fields (for analysis)
      start_year INTEGER,
      start_month INTEGER,
      start_day INTEGER,
      start_hour INTEGER,
      start_day_of_week TEXT,

      -- Detailed Game Info
      is_details_processed BOOLEAN DEFAULT 0,
      play_kind TEXT,
      final_score TEXT,
      scoring_system TEXT,
      end_time TEXT,
      organizer TEXT,
      notes TEXT,
      video_link TEXT,
      protocol_link TEXT,
      pool_name TEXT,
      pool_city TEXT,
      google_maps_link TEXT,

      FOREIGN KEY(league_id) REFERENCES leagues(id)
    );

    CREATE TABLE IF NOT EXISTS table_entries (
        id TEXT PRIMARY KEY, -- "2025_196_TeamName" (composite key might be better but IDs are easier)
        league_id TEXT,
        place INTEGER,
        team TEXT,
        games_played INTEGER,
        wins INTEGER,
        draws INTEGER,
        losses INTEGER,
        goals TEXT,
        goal_diff INTEGER,
        points INTEGER,
        info TEXT,
        image_url TEXT,        -- raw base64 logo as scraped; emptied by dedupe-logos.js
        logo_hash TEXT,        -- reference into logos(hash) after deduplication
        FOREIGN KEY(league_id) REFERENCES leagues(id)
    );

    -- Deduplicated team logos. The scraper writes base64 logos into
    -- table_entries.image_url; scripts/dedupe-logos.js moves the (few) distinct
    -- images here and references them via table_entries.logo_hash, shrinking the
    -- shipped database from ~550 MB to ~15 MB.
    CREATE TABLE IF NOT EXISTS logos (
        hash TEXT PRIMARY KEY,
        data TEXT NOT NULL
    );

    -- League Scorers (from the League page)
    CREATE TABLE IF NOT EXISTS scorers (
        id TEXT PRIMARY KEY, -- "2025_196_PlayerName_Team"
        league_id TEXT,
        place INTEGER,
        name TEXT,
        team TEXT,
        birth_year TEXT,
        goals INTEGER,
        games INTEGER,
        FOREIGN KEY(league_id) REFERENCES leagues(id)
    );

    -- Game Specific Tables

    CREATE TABLE IF NOT EXISTS game_quarter_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT,
        quarter INTEGER,
        home_score INTEGER,
        guest_score INTEGER,
        FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS game_officials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT,
        role TEXT, -- 'referee1', 'timekeeper1', etc.
        name TEXT,
        FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS game_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT,
        time TEXT,
        period INTEGER,
        home_score INTEGER,
        guest_score INTEGER,
        player TEXT,
        event_type TEXT,
        goal_number INTEGER,
        FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS game_lineups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT,
        team_side TEXT, -- 'home' or 'guest'
        number TEXT,
        name TEXT,
        birth_year TEXT,
        goals INTEGER,
        fouls_json TEXT, -- JSON array of fouls [{quarter: 1, type: 'F'}]
        FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS game_team_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT,
        team_side TEXT, -- 'home' or 'guest'
        coach TEXT,
        captain TEXT,
        team_leader TEXT,
        companion_leader TEXT,
        assistant TEXT,
        best_player TEXT,
        FOREIGN KEY(game_id) REFERENCES games(id)
    );

    -- ========================================================================
    -- INDEXES FOR PERFORMANCE
    -- ========================================================================

    -- Primary lookup indexes
    CREATE INDEX IF NOT EXISTS idx_games_league_id ON games(league_id);
    CREATE INDEX IF NOT EXISTS idx_games_start_time ON games(start_time);
    CREATE INDEX IF NOT EXISTS idx_games_result ON games(result);
    CREATE INDEX IF NOT EXISTS idx_games_processed ON games(is_details_processed);

    CREATE INDEX IF NOT EXISTS idx_leagues_season_id ON leagues(season_id);
    CREATE INDEX IF NOT EXISTS idx_leagues_processed ON leagues(is_processed);

    CREATE INDEX IF NOT EXISTS idx_table_entries_league_id ON table_entries(league_id);
    CREATE INDEX IF NOT EXISTS idx_table_entries_place ON table_entries(league_id, place);
    CREATE INDEX IF NOT EXISTS idx_table_entries_logo_hash ON table_entries(logo_hash);

    CREATE INDEX IF NOT EXISTS idx_scorers_league_id ON scorers(league_id);
    CREATE INDEX IF NOT EXISTS idx_scorers_goals ON scorers(goals DESC);
    CREATE INDEX IF NOT EXISTS idx_scorers_name ON scorers(name);

    -- Foreign key indexes for JOINs
    CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_events_player ON game_events(player);
    CREATE INDEX IF NOT EXISTS idx_game_quarter_scores_game_id ON game_quarter_scores(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_officials_game_id ON game_officials(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_lineups_game_id ON game_lineups(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_lineups_name ON game_lineups(name);
    CREATE INDEX IF NOT EXISTS idx_game_team_details_game_id ON game_team_details(game_id);

    -- Composite indexes for specific queries
    CREATE INDEX IF NOT EXISTS idx_games_league_result ON games(league_id, result);
    CREATE INDEX IF NOT EXISTS idx_games_home_team ON games(home_team);
    CREATE INDEX IF NOT EXISTS idx_games_guest_team ON games(guest_team);
    CREATE INDEX IF NOT EXISTS idx_game_events_time ON game_events(game_id, period, time);
    CREATE INDEX IF NOT EXISTS idx_game_lineups_team ON game_lineups(game_id, team_side);

    -- Unique constraints
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scorers_unique ON scorers(league_id, name, team);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quarter_scores_unique ON game_quarter_scores(game_id, quarter);

  `);

  return db;
}

module.exports = { initDB };
