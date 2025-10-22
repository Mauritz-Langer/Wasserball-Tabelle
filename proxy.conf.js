const PROXY_CONFIG = [
  {
    context: ['/api/**'],
    target: 'https://dsvdaten.dsv.de',
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      '^/api': ''
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://dsvdaten.dsv.de/'
    }
  }
];

module.exports = PROXY_CONFIG;
