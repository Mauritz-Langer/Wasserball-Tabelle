export const config = {
  runtime: 'edge',
};

// The edge runtime provides process.env; declared here so the function
// type-checks with the app's tsconfig (no @types/node needed).
declare const process: { env: Record<string, string | undefined> };

// Cross-origin callers are restricted to an allowlist so the proxy can't be
// abused by arbitrary third-party sites to scrape DSV through us. Same-origin
// requests (the app itself) send no Origin header and are always allowed.
// Configure extra origins via the ALLOWED_ORIGINS env var (comma-separated).
const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] || '')
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
    // Forward the caller's query, minus the routing parameter of the rewrite.
    const query = new URLSearchParams(url.search);
    query.delete('path');
    const search = query.toString();
    const targetUrl = `https://dsvdaten.dsv.de${targetPath}${search ? '?' + search : ''}`;
    // Club logos (LogoHandler.ashx) practically never change.
    const isLogo = /LogoHandler\.ashx$/i.test(targetPath);

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

    // Return the response with CORS headers
    // Let Vercel's edge cache absorb repeat requests: every visitor of a
    // league shares one upstream fetch per 30 s, and a stale copy is served
    // instantly while it refreshes in the background. Errors are never cached.
    const cacheControl = !response.ok
      ? 'no-store'
      : isLogo
        ? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'
        : 'public, max-age=0, s-maxage=30, stale-while-revalidate=120';

    // Stream the body through untouched: pages are text, logos are binary.
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/html; charset=utf-8',
        'Cache-Control': cacheControl,
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

