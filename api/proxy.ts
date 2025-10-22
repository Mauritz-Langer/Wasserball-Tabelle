export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);

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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy error: ' + (error as Error).message, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

