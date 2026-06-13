const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive'
};

const PROXY_CONFIG = [
  // Static DSV pages (tables, games, scorers, game details).
  {
    context: ['/api/**'],
    target: 'https://dsvdaten.dsv.de',
    secure: false,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    headers: { ...BROWSER_HEADERS, 'Referer': 'https://dsvdaten.dsv.de/' }
  },
  // Real-time Wasserball liveticker (SignalR 2.x) on a different host.
  {
    context: ['/live-api/**'],
    target: 'https://lizenz.dsv.de',
    secure: false,
    changeOrigin: true,
    pathRewrite: { '^/live-api': '' },
    headers: { ...BROWSER_HEADERS, 'Referer': 'https://lizenz.dsv.de/Live.aspx' }
  }
];

module.exports = PROXY_CONFIG;
