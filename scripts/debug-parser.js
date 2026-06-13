const axios = require('axios');
const { parseHtmlToGames } = require('./parser');

async function test() {
    // 1. Get Home to get cookies?
    // Or just try Referer.
    const url = 'https://dsvdaten.dsv.de/Modules/WB/League.aspx?Season=2025&LeagueID=196&Group=&LeagueKind=L';

    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://dsvdaten.dsv.de/Modules/WB/League.aspx'
            },
            maxRedirects: 5
        });

        console.log(`Final URL: ${res.request.res.responseUrl}`);
        const html = res.data;
        console.log(`Fetched ${html.length} bytes.`);

        const games = parseHtmlToGames(html);
        console.log(`Found ${games.length} games.`);

        if (html.includes('National')) {
            console.log("It seems we are on the Index/Dashboard page.");
        }
    } catch (e) {
        console.error(e);
    }
}

test();
