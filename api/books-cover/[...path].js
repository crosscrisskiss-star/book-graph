export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/books-cover/, '');
  const target = `https://thumbnail-s.images.books.or.jp${path}${url.search}`;

  const upstream = await fetch(target, {
    headers: {
      Referer: 'https://www.books.or.jp/',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  const headers = new Headers({ 'Cache-Control': 'public, max-age=86400' });
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  return new Response(upstream.body, { status: upstream.status, headers });
}
