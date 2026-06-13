export const config = {
  runtime: 'edge',
};

// Cross-origin callers are restricted to an allowlist so the proxy can't be
// abused by arbitrary third-party sites to scrape DSV through us. Same-origin
// requests (the app itself) send no Origin header and are always allowed.
// Configure extra origins via the ALLOWED_ORIGINS env var (comma-separated).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null; // same-origin: no CORS header required
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default async function handler(request: Request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // Extract the path from the URL pathname
  // The path comes after /api/proxy in the format /api/proxy/Modules/WB/...
  let targetPath = url.pathname.replace('/api/proxy', '');

  // If there's a query parameter, use that instead (for backward compatibility)
  const pathParam = url.searchParams.get('path');
  if (pathParam) {
    targetPath = pathParam;
  }

  // If no path is found, return error
  if (!targetPath || targetPath === '/') {
    return new Response('Missing path parameter', { status: 400 });
  }

  // Only allow proxying DSV module pages — not an open relay.
  if (!targetPath.startsWith('/Modules/')) {
    return new Response('Forbidden path', { status: 403 });
  }

  try {
    // Construct the target URL with query parameters
    const targetUrl = `https://dsvdaten.dsv.de${targetPath}${url.search}`;

    // Forward the request to the target server
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Referer': 'https://dsvdaten.dsv.de/',
        'Connection': 'keep-alive',
      },
    });

    // Get the response body
    const body = await response.text();

    // Return the response with CORS headers
    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/html; charset=utf-8',
        ...corsHeaders(request),
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy error: ' + (error as Error).message, {
      status: 500,
      headers: corsHeaders(request),
    });
  }
}

