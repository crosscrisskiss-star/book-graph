export const config = { runtime: 'edge' };

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="96" viewBox="0 0 68 96">
  <rect width="68" height="96" rx="4" fill="#1e3a5f"/>
  <rect x="2" y="2" width="64" height="92" rx="3" fill="none" stroke="#60a5fa" stroke-width="1" opacity=".4"/>
  <text x="34" y="48" fill="#475569" font-family="sans-serif" font-size="10" text-anchor="middle" dominant-baseline="middle">No Cover</text>
</svg>`;

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/books-cover/, '');
  const target = `https://thumbnail-s.images.books.or.jp${path}${url.search}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        Referer: 'https://www.books.or.jp/',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const ct = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !ct.startsWith('image/')) {
      return new Response(FALLBACK_SVG, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    const headers = new Headers({ 'Cache-Control': 'public, max-age=86400', 'content-type': ct });
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response(FALLBACK_SVG, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    });
  }
}
