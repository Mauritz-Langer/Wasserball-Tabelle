const PROXY_CONFIG = [
  {
    context: ['/api/**'],
    target: 'https://dsvdaten.dsv.de',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
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
    },
    onProxyReq: function(proxyReq, req, res) {
      console.log('\n==> Proxying request:');
      console.log('    Method:', req.method);
      console.log('    Original URL:', req.url);
      console.log('    Proxy Target:', proxyReq.path);
      console.log('    Full Target URL:', 'https://dsvdaten.dsv.de' + proxyReq.path);
    },
    onProxyRes: function(proxyRes, req, res) {
      console.log('<== Proxy response:');
      console.log('    Status:', proxyRes.statusCode);
      console.log('    Content-Type:', proxyRes.headers['content-type']);
      console.log('    Content-Length:', proxyRes.headers['content-length']);
    },
    onError: function(err, req, res) {
      console.error('!!! Proxy error:', err.message);
      res.writeHead(500, {
        'Content-Type': 'text/plain'
      });
      res.end('Proxy error: ' + err.message);
    }
  }
];

module.exports = PROXY_CONFIG;
