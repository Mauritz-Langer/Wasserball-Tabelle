export const config = {
  runtime: 'edge',
};

const TARGET = 'https://lizenz.dsv.de';

// Stateless reverse proxy for the DSV Wasserball liveticker (SignalR 2.x) which
// lives on lizenz.dsv.de and sends no CORS headers — so the browser must reach
// it same-origin via /live-api/*. The SignalR longPolling transport is plain
// HTTP (negotiate/connect/start/send/poll), so a pass-through is sufficient;
// the connectionToken carries all state, no cookies required.
export default async function handler(request: Request) {
  const url = new URL(request.url);

  // Path comes either as ?path=/signalr/... (vercel rewrite) or in the pathname.
  let targetPath = url.searchParams.get('path') || url.pathname.replace('/api/live', '');
  if (!targetPath || targetPath === '/') {
    return new Response('Missing path', { status: 400 });
  }

  // Forward every query param except our internal "path".
  const params = new URLSearchParams(url.search);
  params.delete('path');
  const qs = params.toString();
  const targetUrl = `${TARGET}${targetPath}${qs ? '?' + qs : ''}`;

  const init: RequestInit = {
    method: request.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'Referer': 'https://lizenz.dsv.de/Live.aspx',
      // SignalR's /send posts form-encoded data.
      'Content-Type': request.headers.get('Content-Type') || 'application/x-www-form-urlencoded; charset=UTF-8',
    },
  };

  if (request.method === 'POST') {
    init.body = await request.text();
  }

  try {
    const response = await fetch(targetUrl, init);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response('Live proxy error: ' + (error as Error).message, { status: 502 });
  }
}
