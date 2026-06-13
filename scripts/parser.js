const { JSDOM } = require('jsdom');
const utils = require('./parser'); // Self-reference if reusing existing exports, simplified below

// --- Helper Functions adapted from GameDetailsService ---

function getTextContent(doc, id) {
    const element = doc.getElementById(id);
    if (!element) return '';

    const text = element.textContent?.trim() || '';
    if (!text) return '';

    if (text.includes('Uhr')) {
        return text;
    }

    if (text.includes(':')) {
        const colonIndex = text.indexOf(':');
        if (colonIndex === text.length - 1) {
            return '';
        }
        if (colonIndex < text.length - 1 && text[colonIndex + 1] === ' ') {
            const label = text.substring(0, colonIndex).trim();
            const value = text.substring(colonIndex + 1).trim();
            if (!value || value === label || value.endsWith(label + ':')) {
                return '';
            }
            return value;
        }
        return text;
    }
    return text;
}

function getAttribute(doc, id, attribute) {
    return doc.getElementById(id)?.getAttribute(attribute) || null;
}

function extractLogosAndNamesFromHeader(doc) {
    let homeLogoUrl = '';
    let guestLogoUrl = '';
    let homeName = '';
    let guestName = '';

    const headerElement = doc.getElementById('ContentSection__headerLabel');
    if (headerElement) {
        const fullHeaderText = headerElement.textContent?.trim() || '';
        if (fullHeaderText.includes(':')) {
            const parts = fullHeaderText.split(':');
            homeName = parts[0]?.trim() || '';
            guestName = parts[1]?.trim() || '';
        }

        const childNodes = Array.from(headerElement.childNodes);
        let foundColon = false;

        for (const node of childNodes) {
            // JSDOM Text node type is 3
            if (node.nodeType === 3 && node.textContent?.includes(':')) {
                foundColon = true;
                continue;
            }

            if (node.nodeType === 1 && node.tagName === 'IMG') {
                const imgSrc = node.getAttribute('src');
                if (!imgSrc) continue;

                let logoUrl = '';
                if (imgSrc.startsWith('data:')) {
                    logoUrl = imgSrc;
                } else if (imgSrc.startsWith('http')) {
                    logoUrl = imgSrc;
                } else {
                    logoUrl = 'https://dsvdaten.dsv.de' + (imgSrc.startsWith('/') ? '' : '/') + imgSrc;
                }

                if (!foundColon) {
                    homeLogoUrl = logoUrl;
                } else {
                    guestLogoUrl = logoUrl;
                }
            }
        }
    }
    return { homeLogoUrl, guestLogoUrl, homeName, guestName };
}

function parseFinalScoreAndSystem(doc) {
    let finalScore = '';
    let scoringSystem = '';

    const scoringLabel = getTextContent(doc, 'ContentSection__scoringLabel');
    if (scoringLabel && (scoringLabel.includes('Punkt') || scoringLabel.includes('System'))) {
        scoringSystem = scoringLabel;
    }

    const scoreboard = doc.getElementById('ContentSection_scoreboard_data');
    if (scoreboard) {
        const table = scoreboard.querySelector('table');
        if (table) {
            const rows = table.querySelectorAll('tr');
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const th = row.querySelector('th');
                if (th && th.textContent?.includes('Tore Total')) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const homeScore = cells[0].textContent?.trim().replace(/<\/?b>/g, '') || '0';
                        const guestScore = cells[1].textContent?.trim().replace(/<\/?b>/g, '') || '0';
                        finalScore = `${homeScore}:${guestScore}`;
                        break;
                    }
                }
            }
        }
    }

    if (!finalScore && scoringLabel && !scoringSystem) {
        finalScore = scoringLabel;
    }

    return { finalScore, scoringSystem };
}

function parseQuarterScores(doc) {
    const quarterScores = [];

    const scoreboardData = doc.getElementById('ContentSection_scoreboard_data');
    if (scoreboardData) {
        const table = scoreboardData.querySelector('table');
        if (table) {
            const rows = table.querySelectorAll('tr');
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const th = row.querySelector('th');
                if (th && th.textContent?.includes('Abschn')) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const homeScoresText = cells[0].textContent?.trim() || '';
                        const guestScoresText = cells[1].textContent?.trim() || '';

                        const homeScores = homeScoresText.split('-').map(s => parseInt(s.trim()));
                        const guestScores = guestScoresText.split('-').map(s => parseInt(s.trim()));

                        for (let q = 0; q < Math.min(homeScores.length, guestScores.length); q++) {
                            if (!isNaN(homeScores[q]) && !isNaN(guestScores[q])) {
                                quarterScores.push({
                                    quarter: q + 1,
                                    home: homeScores[q],
                                    guest: guestScores[q]
                                });
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    if (quarterScores.length === 0) {
        const scoreboard = doc.getElementById('ContentSection_scoreboard');
        if (scoreboard) {
            const rows = scoreboard.querySelectorAll('tr');
            if (rows.length >= 3) {
                const homeCells = rows[1].querySelectorAll('td');
                const guestCells = rows[2].querySelectorAll('td');

                for (let i = 1; i <= 4 && i < homeCells.length - 1; i++) {
                    const homeText = homeCells[i]?.textContent?.trim() || '0';
                    const guestText = guestCells[i]?.textContent?.trim() || '0';
                    const homeScore = parseInt(homeText);
                    const guestScore = parseInt(guestText);

                    if (!isNaN(homeScore) && !isNaN(guestScore)) {
                        quarterScores.push({
                            quarter: i,
                            home: homeScore,
                            guest: guestScore
                        });
                    }
                }
            }
        }
    }
    return quarterScores;
}

function parseVenue(doc) {
    return {
        poolName: getTextContent(doc, 'ContentSection__poolnameLabel'),
        poolCity: getTextContent(doc, 'ContentSection__poolcityLabel'),
        googleMapsLink: getAttribute(doc, 'ContentSection__googleHyperLink', 'href') || ''
    };
}

function parseOfficials(doc) {
    return {
        referee1: getTextContent(doc, 'ContentSection__schiedsrichter1Label'),
        referee2: getTextContent(doc, 'ContentSection__schiedsrichter2Label'),
        timekeeper1: getTextContent(doc, 'ContentSection__zeitnehmer1Label'),
        timekeeper2: getTextContent(doc, 'ContentSection__zeitnehmer2Label'),
        secretary1: getTextContent(doc, 'ContentSection__sekretaer1Label'),
        secretary2: getTextContent(doc, 'ContentSection__sekretaer2Label'),
        goalJudge1: getTextContent(doc, 'ContentSection__torrichter1Label'),
        goalJudge2: getTextContent(doc, 'ContentSection__torrichter2Label'),
        observer1: getTextContent(doc, 'ContentSection__observer1Label'),
        observer2: getTextContent(doc, 'ContentSection__observer2Label'),
    };
}

function parseGameEvents(doc) {
    const events = [];
    let lastHomeScore = 0;
    let lastGuestScore = 0;

    for (let i = 0; i < 100; i++) {
        const timeElement = doc.getElementById(`ContentSection__gameRepeater__timeLabel_${i}`);
        if (!timeElement) break;

        const time = timeElement.textContent?.trim() || '';
        const period = getTextContent(doc, `ContentSection__gameRepeater__periodLabel_${i}`);
        const player = getTextContent(doc, `ContentSection__gameRepeater__playerLabel_${i}`);
        const eventType = getTextContent(doc, `ContentSection__gameRepeater__eventkeyLabel_${i}`);

        const goalsElement = doc.getElementById(`ContentSection__gameRepeater__goalsLabel_${i}`);
        const goalsText = goalsElement?.textContent?.trim() || '';

        let homeScore = lastHomeScore;
        let guestScore = lastGuestScore;
        let goalNumber = undefined;

        if (goalsText) {
            const scoreMatch = goalsText.match(/(\d+):(\d+)/);
            if (scoreMatch) {
                homeScore = parseInt(scoreMatch[1]);
                guestScore = parseInt(scoreMatch[2]);
                lastHomeScore = homeScore;
                lastGuestScore = guestScore;

                if (eventType === 'T' || eventType === 'Tor' || eventType === 'Goal') {
                    goalNumber = homeScore + guestScore;
                }
            }
        }

        events.push({
            time,
            period: parseInt(period || '0'),
            homeScore,
            guestScore,
            player: player || '',
            eventType: eventType || '',
            goalNumber
        });
    }
    return events;
}

function parsePlayerStatistics(doc, prefix) {
    const players = [];
    try {
        const playersTab = doc.getElementById('players');
        if (!playersTab) return players;

        const teamContainers = playersTab.querySelectorAll('.col-12.col-md-6');
        const teamIndex = prefix === 'white' ? 0 : 1;
        if (teamContainers.length <= teamIndex) return players;

        const teamContainer = teamContainers[teamIndex];
        const table = teamContainer.querySelector('table');
        if (!table) return players;

        const rows = table.querySelectorAll('tr');
        for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            if (cells.length < 8) continue;

            const number = cells[0]?.textContent?.trim() || '';
            const name = cells[1]?.textContent?.trim() || '';
            const birthYear = cells[2]?.textContent?.trim() || '';
            const goalsText = cells[3]?.textContent?.trim() || '';
            const goals = (goalsText && goalsText !== '\u00A0' && goalsText !== '') ? parseInt(goalsText) : 0;

            const fouls = [];
            for (let quarter = 1; quarter <= 4; quarter++) {
                const foulText = cells[3 + quarter]?.textContent?.trim() || '';
                const foulType = (foulText && foulText !== '\u00A0' && foulText !== '') ? foulText : '';
                if (foulType) {
                    fouls.push({ quarter, foulType });
                }
            }

            players.push({
                number,
                name,
                birthYear,
                goals: isNaN(goals) ? 0 : goals,
                fouls
            });
        }
    } catch (e) {
        console.error('Error parsing player stats:', e);
    }
    return players;
}

function parseTeamStatistics(doc, tableId, label) {
    const data = {};
    const table = doc.getElementById(tableId);

    if (table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length >= 2) {
                const key = cells[0]?.textContent?.trim() || '';
                const value = cells[1]?.textContent?.trim() || '';
                if (key && value) {
                    data[key] = value;
                }
            }
        });
    }
    return { label, data };
}

function parseStatistics(doc) {
    // Note: The service returned null if no labels.
    const homeStatsLabel = getTextContent(doc, 'ContentSection__stats_homeLabel');
    const guestStatsLabel = getTextContent(doc, 'ContentSection__stats_guestLabel');

    if (!homeStatsLabel && !guestStatsLabel) return null;

    return {
        home: parseTeamStatistics(doc, 'ContentSection_stats_home', homeStatsLabel),
        guest: parseTeamStatistics(doc, 'ContentSection_stats_guest', guestStatsLabel)
    };
}

function parseHtmlToGameDetails(html) {
    // Basic cleanup
    html = html.replace(/<nobr>/g, '')
        .replace(/<\/nobr>/g, '')
        .replace(/target=_blank/g, '');

    let doc;
    try {
        const dom = new JSDOM(html);
        doc = dom.window.document;
    } catch (e) {
        console.error("Error parsing Game Details HTML:", e);
        return null;
    }

    const { homeLogoUrl, guestLogoUrl, homeName, guestName } = extractLogosAndNamesFromHeader(doc);

    // Parse Teams
    const parseTeam = (prefix, logo, fallback) => {
        const name = getTextContent(doc, `ContentSection__${prefix}Label`) || fallback;
        const players = parsePlayerStatistics(doc, prefix);

        return {
            name,
            logoUrl: logo,
            coach: getTextContent(doc, `ContentSection__${prefix}coachLabel`),
            captain: getTextContent(doc, `ContentSection__${prefix}captainLabel`),
            teamLeader: getTextContent(doc, `ContentSection__${prefix}leiterLabel`),
            companionLeader: getTextContent(doc, `ContentSection__${prefix}begleiterLabel`),
            assistant: getTextContent(doc, `ContentSection__${prefix}betreuerLabel`),
            bestPlayer: getTextContent(doc, `ContentSection__${prefix}bestLabel`),
            players: players.length > 0 ? players : undefined
        };
    };

    const homeTeam = parseTeam('white', homeLogoUrl, homeName);
    const guestTeam = parseTeam('blue', guestLogoUrl, guestName);

    const { finalScore, scoringSystem } = parseFinalScoreAndSystem(doc);

    return {
        gameId: getTextContent(doc, 'ContentSection__gameidLabel'),
        league: getTextContent(doc, 'ContentSection__leagueLabel'),
        startDate: getTextContent(doc, 'ContentSection__startdateLabel'),
        playKind: getTextContent(doc, 'ContentSection__playkindLabel'),
        homeTeam,
        guestTeam,
        finalScore,
        scoringSystem,
        quarterScores: parseQuarterScores(doc),
        venue: parseVenue(doc),
        officials: parseOfficials(doc),
        events: parseGameEvents(doc),
        statistics: parseStatistics(doc),
        notes: getTextContent(doc, 'ContentSection__noteLabel'),
        videoLink: getAttribute(doc, 'ContentSection__videolinkHyperLink', 'href'),
        protocolLink: getAttribute(doc, 'ContentSection__protocolLinkButton', 'href'),
        endGameTime: getTextContent(doc, 'ContentSection__endgameLabel'),
        organizer: getTextContent(doc, 'ContentSection__organizerLabel')
    };
}


// --- Re-export existing functions ---
// I need to copy previous functions back in OR import them. 
// Since replace_file_content replaces the whole file if I overwrite, I must include EVERYTHING.
// Or I can use Node's require to keep it modular but let's stick to one file for simplicity if needed,
// BUT I previously used `overwrite` so I have to put everything back.

// ... COPYING PREVIOUS FUNCTIONS ...

function getLigaName(html) {
    let doc;
    try {
        const dom = new JSDOM(html);
        doc = dom.window.document;
    } catch (error) {
        console.error('Error parsing HTML:', error);
        return '';
    }

    const headerLabel = doc.getElementById('ContentSection__headerLabel');
    if (!headerLabel || !headerLabel.textContent) {
        return '';
    }
    return headerLabel.textContent.trim();
}

function extractTeamImages(doc) {
    const teamImages = new Map();
    let tableTable = doc.getElementById('table');
    if (!tableTable) {
        const tableLabel = doc.getElementById('ContentSection__tableLabel');
        if (tableLabel) {
            let parent = tableLabel.parentElement;
            while (parent && !parent.classList.contains('card-header')) parent = parent.parentElement;
            if (parent && parent.nextElementSibling) tableTable = parent.nextElementSibling.querySelector('table');
        }
    }

    if (tableTable) {
        const rows = tableTable.getElementsByTagName('tr');
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            if (cells.length < 10) continue;
            const teamText = cells[2].textContent.trim();
            const teamName = teamText.split(' - ')[0].trim();
            const imgElement = cells[1].querySelector('img');
            if (imgElement) {
                const src = imgElement.getAttribute('src');
                if (src) {
                    let imageUrl = '';
                    if (src.startsWith('data:')) imageUrl = src;
                    else if (src.includes('base64,') || src.startsWith('svg+xml')) {
                        if (src.startsWith('svg+xml;base64,')) imageUrl = 'data:image/svg+xml;base64,' + src.substring(15);
                        else if (!src.startsWith('data:')) imageUrl = 'data:image/' + src;
                        else imageUrl = src;
                    } else if (src.startsWith('http')) imageUrl = src;
                    else imageUrl = 'https://dsvdaten.dsv.de' + (src.startsWith('/') ? '' : '/') + src;
                    teamImages.set(teamName, imageUrl);
                }
            }
        }
    }
    return teamImages;
}

function parseHtmlToGames(html) {
    html = cleanHtml(html);
    let doc;
    const games = [];
    try {
        const dom = new JSDOM(html);
        doc = dom.window.document;
    } catch (error) { return []; }

    const teamImages = extractTeamImages(doc);
    let gameTable = doc.getElementById('games');
    if (!gameTable) {
        const roundLabel = doc.getElementById('ContentSection__roundLabel');
        if (roundLabel) {
            let parent = roundLabel.parentElement;
            while (parent && !parent.classList.contains('card-header')) parent = parent.parentElement;
            if (parent && parent.nextElementSibling) gameTable = parent.nextElementSibling.querySelector('table');
        }
    }

    if (gameTable) {
        const rows = gameTable.getElementsByTagName('tr');
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            if (cells.length < 6) continue;
            let startCell, homeCell, guestCell, locationCell, resultCell;
            if (cells.length >= 8) {
                startCell = cells[1];
                homeCell = cells[3];
                guestCell = cells[5];
                locationCell = cells[6];
                resultCell = cells[7];
            } else {
                startCell = cells[1];
                homeCell = cells[2];
                guestCell = cells[3];
                locationCell = cells[4];
                resultCell = cells[5];
            }
            let result = resultCell.textContent.trim();
            if (result === 'mehr...') result = ' - ';
            let link = '';
            const linkElement = resultCell.querySelector('a');
            if (linkElement) {
                const href = linkElement.getAttribute('href');
                if (href) link = href.replace('https://dsvdaten.dsv.de/Modules/WB/', '');
            }
            const homeTeam = homeCell.textContent.trim();
            const guestTeam = guestCell.textContent.trim();
            games.push({
                start: startCell.textContent.trim(),
                home: homeTeam,
                homeImageUrl: teamImages.get(homeTeam) || '',
                guest: guestTeam,
                guestImageUrl: teamImages.get(guestTeam) || '',
                location: locationCell.textContent.trim(),
                gameLink: link,
                result: result
            });
        }
    }
    return games;
}

function parseHtmlToTable(html) {
    html = cleanHtml(html);
    let doc;
    const tables = [];
    try {
        const dom = new JSDOM(html);
        doc = dom.window.document;
    } catch (error) { return []; }

    let tableTable = doc.getElementById('table');
    if (!tableTable) {
        const tableLabel = doc.getElementById('ContentSection__tableLabel');
        if (tableLabel) {
            let parent = tableLabel.parentElement;
            while (parent && !parent.classList.contains('card-header')) parent = parent.parentElement;
            if (parent && parent.nextElementSibling) tableTable = parent.nextElementSibling.querySelector('table');
        }
    }

    if (tableTable) {
        const rows = tableTable.getElementsByTagName('tr');
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            if (cells.length < 10) continue;
            let info = '';
            const teamText = cells[2].textContent.trim();
            if (teamText.includes(' - ')) {
                const parts = teamText.split(' - ');
                info = parts[1].trim();
            }
            let imageUrl = '';
            const imgElement = cells[1].querySelector('img');
            if (imgElement) {
                const src = imgElement.getAttribute('src');
                if (src) {
                    if (src.startsWith('data:')) imageUrl = src;
                    else if (src.includes('base64,') || src.startsWith('svg+xml')) {
                        if (src.startsWith('svg+xml;base64,')) imageUrl = 'data:image/svg+xml;base64,' + src.substring(15);
                        else if (!src.startsWith('data:')) imageUrl = 'data:image/' + src;
                        else imageUrl = src;
                    } else if (src.startsWith('http')) imageUrl = src;
                    else imageUrl = 'https://dsvdaten.dsv.de' + (src.startsWith('/') ? '' : '/') + src;
                }
            }

            tables.push({
                place: parseInt(cells[0].textContent.trim()),
                team: teamText.split(' - ')[0].trim(),
                info: info,
                imageUrl: imageUrl,
                games: parseInt(cells[3].textContent.trim().split('/')[0]),
                wins: parseInt(cells[4].textContent.trim()),
                draws: parseInt(cells[5].textContent.trim()),
                losses: parseInt(cells[6].textContent.trim()),
                goals: cells[7].textContent.trim(),
                goalDifference: parseInt(cells[8].textContent.trim().replace('+', '')),
                points: parseInt(cells[9].textContent.trim())
            });
        }
    }
    return tables;
}

function parseHtmlToScorer(html) {
    html = cleanHtml(html);
    let doc;
    const scorers = [];
    try {
        const dom = new JSDOM(html);
        doc = dom.window.document;
    } catch (error) { return []; }

    let scorer = doc.getElementById('scorer');
    if (!scorer) {
        const scorerLabel = doc.getElementById('ContentSection__scorerLabel');
        if (scorerLabel) {
            let parent = scorerLabel.parentElement;
            while (parent && !parent.classList.contains('card-header')) parent = parent.parentElement;
            if (parent && parent.nextElementSibling) scorer = parent.nextElementSibling.querySelector('table');
        }
    }

    if (scorer) {
        const rows = scorer.getElementsByTagName('tr');
        let lastPlace = 0;
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            if (cells.length < 5) continue;
            const placeText = cells[0].textContent.trim();
            if (placeText && !isNaN(parseInt(placeText))) lastPlace = parseInt(placeText);
            const hasYear = cells.length > 5;
            scorers.push({
                place: lastPlace,
                name: cells[1].textContent.trim(),
                team: cells[2].textContent.trim(),
                birthYear: hasYear ? cells[3].textContent.trim() : '',
                goals: parseInt(cells[hasYear ? 4 : 3].textContent.trim()),
                games: parseInt(cells[hasYear ? 5 : 4].textContent.trim())
            });
        }
    }
    return scorers;
}

function cleanHtml(html) {
    return html.replace(/<nobr>/g, '').replace(/<\/nobr>/g, '').replace(/target=_blank/g, '');
}

function parseLeagueOptions(html) {
    const dom = new JSDOM(cleanHtml(html));
    const doc = dom.window.document;
    const selectors = ['ContentSection__weekDropDownList', 'ContentSection__seasonDropDownList', 'ContentSection__clubs_seasonDropDownList'];
    let options = [];
    for (const selectorId of selectors) {
        const select = doc.getElementById(selectorId);
        if (select) {
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                if (opt.value && opt.value !== '' && !opt.value.includes('* alle') && !opt.value.includes('* bitte')) {
                    options.push({ text: opt.textContent.trim(), value: opt.value, type: selectorId });
                }
            }
        }
    }
    return options;
}

function parseLeagueLinks(html) {
    const dom = new JSDOM(cleanHtml(html));
    const doc = dom.window.document;
    const cards = doc.querySelectorAll('.card');
    const result = [];

    cards.forEach(card => {
        const header = card.querySelector('.card-header');
        const category = header ? header.textContent.trim() : 'Sonstige';
        const links = card.querySelectorAll('a[href*="League.aspx"]');

        links.forEach(a => {
            result.push({
                text: a.textContent.trim(),
                href: a.href,
                title: a.title,
                category: category
            });
        });
    });

    // Fallback if no cards found (e.g. diff structure), try old method for generic links but ideally we rely on cards now
    if (result.length === 0) {
        const links = doc.querySelectorAll('a[href*="League.aspx"]');
        links.forEach(a => {
            result.push({ text: a.textContent.trim(), href: a.href, title: a.title, category: 'Allgemein' });
        });
    }

    return result;
}

module.exports = {
    parseLeagueOptions, parseLeagueLinks, cleanHtml,
    parseHtmlToGames, parseHtmlToTable, parseHtmlToScorer,
    getLigaName, parseHtmlToGameDetails
};
