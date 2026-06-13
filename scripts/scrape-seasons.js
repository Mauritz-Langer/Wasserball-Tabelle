const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { initDB } = require('./db');
const {
    parseLeagueLinks, parseHtmlToGames, parseHtmlToTable, parseHtmlToScorer,
    parseHtmlToGameDetails
} = require('./parser');

const BASE_URL = 'https://dsvdaten.dsv.de/Modules/WB/';
const SEED_FILE = path.join(__dirname, '../combined-seasons.html');
const DELAY_MS = 1000; // Base delay
const GAME_DELAY_MS = 800; // Base game delay
const MAX_CONSECUTIVE_ERRORS = 5;

// Randomize delay to appear more human (0.8x to 1.2x)
const getJitterDelay = (base) => Math.floor(base * (0.8 + Math.random() * 0.4));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Parse score "X:Y" -> {home, guest, diff, total}
function parseScore(resultString) {
    if (!resultString || resultString.trim() === '' || resultString.trim() === '-' || resultString.trim() === ' - ') {
        return { home_score: null, guest_score: null, goal_difference: null, total_goals: null };
    }

    try {
        const [homeStr, guestStr] = resultString.split(':');
        const home = parseInt(homeStr?.trim());
        const guest = parseInt(guestStr?.trim());

        if (!isNaN(home) && !isNaN(guest)) {
            return {
                home_score: home,
                guest_score: guest,
                goal_difference: home - guest,
                total_goals: home + guest
            };
        }
    } catch (e) {
        // Ignore parsing errors
    }

    return { home_score: null, guest_score: null, goal_difference: null, total_goals: null };
}

// Helper: Parse date "DD.MM.YY, HH:MM Uhr" -> {year, month, day, hour, day_of_week}
function parseDateTime(dateTimeString) {
    if (!dateTimeString || dateTimeString.trim() === '') {
        return { start_year: null, start_month: null, start_day: null, start_hour: null, start_day_of_week: null };
    }

    try {
        // Format: "04.10.25, 16:00 Uhr" oder "04.10.2025 17:09 Uhr"
        const match = dateTimeString.match(/(\d{2})\.(\d{2})\.(\d{2,4})[,\s]+(\d{1,2}):(\d{2})/);

        if (match) {
            const [, day, month, yearShort, hour] = match;
            const year = yearShort.length === 2 ? 2000 + parseInt(yearShort) : parseInt(yearShort);

            // JavaScript Date für day_of_week
            const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
            const date = new Date(year, parseInt(month) - 1, parseInt(day));
            const dayOfWeek = dayNames[date.getDay()];

            return {
                start_year: year,
                start_month: parseInt(month),
                start_day: parseInt(day),
                start_hour: parseInt(hour),
                start_day_of_week: dayOfWeek
            };
        }
    } catch (e) {
        // Ignore parsing errors
    }

    return { start_year: null, start_month: null, start_day: null, start_hour: null, start_day_of_week: null };
}

async function fetchUrl(url) {
    try {
        const fullUrl = url.startsWith('http') ? url : BASE_URL + url;
        // console.log(`Fetching: ${fullUrl}`);
        const response = await axios.get(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://dsvdaten.dsv.de/'
            },
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 500 // Handle 4xx manually
        });

        if (response.status === 403 || response.status === 429) {
            throw new Error(`BLOCKED status ${response.status}`);
        }

        return response.data;
    } catch (error) {
        if (error.message.includes('BLOCKED')) throw error;
        console.error(`Failed to fetch ${url}: ${error.message}`);
        return null;
    }
}

async function main() {
    const db = initDB();
    let consecutiveErrors = 0;

    // --- Statements ---
    const insertLeague = db.prepare(`
     INSERT INTO leagues (id, season_id, original_id, name, link_url)
     VALUES (@id, @season, @originalId, @name, @link_url)
     ON CONFLICT(id) DO UPDATE SET name = @name
  `);
    const insertSeason = db.prepare(`INSERT OR IGNORE INTO seasons (id, name) VALUES (?, ?)`);
    const insertGame = db.prepare(`
        INSERT INTO games (
            id, league_id, game_id_dsv, start_time, home_team, guest_team, location, result, link_url,
            is_details_processed, home_score, guest_score, goal_difference, total_goals,
            start_year, start_month, start_day, start_hour, start_day_of_week
        )
        VALUES (
            @id, @league_id, @game_id_dsv, @start_time, @home_team, @guest_team, @location, @result, @link_url,
            0, @home_score, @guest_score, @goal_difference, @total_goals,
            @start_year, @start_month, @start_day, @start_hour, @start_day_of_week
        )
        ON CONFLICT(id) DO UPDATE SET
            result = @result,
            link_url = @link_url,
            home_score = @home_score,
            guest_score = @guest_score,
            goal_difference = @goal_difference,
            total_goals = @total_goals
    `);

    // Scorers
    const insertScorer = db.prepare(`
        INSERT INTO scorers (id, league_id, place, name, team, birth_year, goals, games)
        VALUES (@id, @league_id, @place, @name, @team, @birthYear, @goals, @games)
        ON CONFLICT(id) DO UPDATE SET goals = @goals, games = @games
    `);
    const insertTableEntry = db.prepare(`
        INSERT INTO table_entries (id, league_id, place, team, games_played, wins, draws, losses, goals, goal_diff, points, info, image_url)
        VALUES (@id, @league_id, @place, @team, @games, @wins, @draws, @losses, @goals, @goalDifference, @points, @info, @imageUrl)
        ON CONFLICT(id) DO UPDATE SET points = @points
    `);

    // Game Details Update
    const updateGameDetails = db.prepare(`
        UPDATE games SET
            is_details_processed = 1,
            play_kind = @playKind,
            final_score = @finalScore,
            scoring_system = @scoringSystem,
            end_time = @endGameTime,
            organizer = @organizer,
            notes = @notes,
            video_link = @videoLink,
            protocol_link = @protocolLink,
            pool_name = @poolName,
            pool_city = @poolCity,
            google_maps_link = @googleMapsLink
        WHERE id = @gameId
    `);

    // Detail Sub-tables
    const insertQuarterScore = db.prepare(`INSERT INTO game_quarter_scores (game_id, quarter, home_score, guest_score) VALUES (@gameId, @quarter, @home, @guest)`);
    const insertOfficial = db.prepare(`INSERT INTO game_officials (game_id, role, name) VALUES (@gameId, @role, @name)`);
    const insertEvent = db.prepare(`INSERT INTO game_events (game_id, time, period, home_score, guest_score, player, event_type, goal_number) VALUES (@gameId, @time, @period, @homeScore, @guestScore, @player, @eventType, @goalNumber)`);
    const insertLineup = db.prepare(`INSERT INTO game_lineups (game_id, team_side, number, name, birth_year, goals, fouls_json) VALUES (@gameId, @side, @number, @name, @birthYear, @goals, @foulsJson)`);
    const insertTeamDetails = db.prepare(`INSERT INTO game_team_details (game_id, team_side, coach, captain, team_leader, companion_leader, assistant, best_player) VALUES (@gameId, @side, @coach, @captain, @teamLeader, @companionLeader, @assistant, @bestPlayer)`);


    // --- 1. Populate Leagues from Seed ---
    console.log('Reading seed file...');
    if (fs.existsSync(SEED_FILE)) {
        const seedHtml = await fs.readFile(SEED_FILE, 'utf8');
        const leagueLinks = parseLeagueLinks(seedHtml);

        console.log(`Found ${leagueLinks.length} links in seed file.`);

        const uniqueLeagues = new Map();
        leagueLinks.forEach(link => {
            const href = link.href.replace('https://dsvdaten.dsv.de/Modules/WB/', '');
            const urlObj = new URL(href, BASE_URL);
            const season = urlObj.searchParams.get('Season');
            const leagueId = urlObj.searchParams.get('LeagueID');
            const group = urlObj.searchParams.get('Group') || '';

            if (season && leagueId) {
                const id = `${season}_${leagueId}${group ? '_' + group : ''}`;
                if (!uniqueLeagues.has(id)) {
                    uniqueLeagues.set(id, {
                        id,
                        season,
                        originalId: leagueId,
                        name: link.text,
                        link_url: href
                    });
                }
            }
        });

        db.transaction(() => {
            for (const league of uniqueLeagues.values()) {
                insertSeason.run(league.season, `Saison ${league.season}`);
                insertLeague.run(league);
            }
        })();
    }

    // --- 2. Process Leagues ---
    const leaguesToProcess = db.prepare(`SELECT * FROM leagues WHERE is_processed = 0 ORDER BY season_id DESC`).all();
    console.log(`Leagues remaining to process: ${leaguesToProcess.length}`);

    for (const league of leaguesToProcess) {
        console.log(`Processing League: ${league.name} (${league.season_id})`);

        let html;
        try {
            html = await fetchUrl(league.link_url);
        } catch (e) {
            console.error('!!! IP BLOCKED or NETWORK ERROR !!! Saving progress and exiting.');
            process.exit(1);
        }

        if (!html) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error('Too many errors. Exiting to be safe.');
                process.exit(1);
            }
            continue;
        }
        consecutiveErrors = 0;

        const games = parseHtmlToGames(html);
        const tables = parseHtmlToTable(html);
        const scorers = parseHtmlToScorer(html);

        console.log(`Found ${games.length} games, ${tables.length} table entries, ${scorers.length} scorers.`);

        db.transaction(() => {
            // Store Games (Basic)
            for (const g of games) {
                let gameIdDsv = null;
                if (g.gameLink) {
                    const gUrl = new URL(g.gameLink, BASE_URL);
                    gameIdDsv = gUrl.searchParams.get('GameID');
                }
                const gid = gameIdDsv ? `${league.id}_${gameIdDsv}` : `${league.id}_idx${games.indexOf(g)}`;

                // Parse score and datetime for analysis
                const scoreData = parseScore(g.result);
                const dateData = parseDateTime(g.start);

                insertGame.run({
                    id: gid,
                    league_id: league.id,
                    game_id_dsv: gameIdDsv,
                    start_time: g.start,
                    home_team: g.home,
                    guest_team: g.guest,
                    location: g.location,
                    result: g.result,
                    link_url: g.gameLink,
                    ...scoreData,
                    ...dateData
                });
            }

            // Store Table
            for (const t of tables) {
                const tid = `${league.id}_${t.team}`;
                insertTableEntry.run({ ...t, id: tid, league_id: league.id });
            }

            // Store Scorers
            for (const s of scorers) {
                const sid = `${league.id}_${s.name}_${s.team}`;
                insertScorer.run({ ...s, id: sid, league_id: league.id });
            }
        })();

        // Mark league processed
        db.prepare(`UPDATE leagues SET is_processed = 1 WHERE id = ?`).run(league.id);

        await sleep(getJitterDelay(DELAY_MS));
    }

    // --- 3. Process Game Details ---
    const gamesToProcess = db.prepare(`
        SELECT id, link_url FROM games
        WHERE link_url IS NOT NULL AND link_url != '' AND is_details_processed = 0
    `).all();

    console.log(`Games waiting for details: ${gamesToProcess.length}`);

    for (const game of gamesToProcess) {
        // console.log(`Fetching Game Details: ${game.id}`);
        let html;
        try {
            html = await fetchUrl(game.link_url);
        } catch (e) {
            console.error('!!! IP BLOCKED or NETWORK ERROR !!! Saving progress and exiting.');
            process.exit(1);
        }

        if (!html) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error('Too many errors. Exiting.');
                process.exit(1);
            }
            continue;
        }
        consecutiveErrors = 0;

        const details = parseHtmlToGameDetails(html);
        if (details) {
            db.transaction(() => {
                // Update Game metadata
                updateGameDetails.run({
                    gameId: game.id,
                    playKind: details.playKind,
                    finalScore: details.finalScore,
                    scoringSystem: details.scoringSystem,
                    endGameTime: details.endGameTime,
                    organizer: details.organizer,
                    notes: details.notes,
                    videoLink: details.videoLink,
                    protocolLink: details.protocolLink,
                    poolName: details.venue?.poolName,
                    poolCity: details.venue?.poolCity,
                    googleMapsLink: details.venue?.googleMapsLink
                });

                // Insert Sub-data (clean old first if re-running? - assuming simplified flow for now)
                // Or rather, we use transactions for new inserts since we query is_details_processed=0

                if (details.quarterScores) {
                    for (const qs of details.quarterScores) insertQuarterScore.run({ gameId: game.id, ...qs });
                }
                if (details.officials) {
                    for (const [role, name] of Object.entries(details.officials)) {
                        if (name) insertOfficial.run({ gameId: game.id, role, name });
                    }
                }
                if (details.events) {
                    for (const evt of details.events) insertEvent.run({ gameId: game.id, ...evt });
                }

                // Lineups and Team Details
                const processTeam = (team, side) => {
                    if (!team) return;
                    insertTeamDetails.run({
                        gameId: game.id, side,
                        coach: team.coach, captain: team.captain, teamLeader: team.teamLeader,
                        companionLeader: team.companionLeader, assistant: team.assistant, bestPlayer: team.bestPlayer
                    });
                    if (team.players) {
                        for (const p of team.players) {
                            insertLineup.run({
                                gameId: game.id, side,
                                number: p.number, name: p.name, birthYear: p.birthYear, goals: p.goals,
                                foulsJson: JSON.stringify(p.fouls)
                            });
                        }
                    }
                };

                processTeam(details.homeTeam, 'home');
                processTeam(details.guestTeam, 'guest');

            })();
        }

        // Simple progress log every 10 games
        if (gamesToProcess.indexOf(game) % 10 === 0) {
            console.log(`Processed ${gamesToProcess.indexOf(game)} / ${gamesToProcess.length} details...`);
        }

        await sleep(getJitterDelay(GAME_DELAY_MS));
    }

    console.log('Done processing all data.');
}

main().catch(console.error);
