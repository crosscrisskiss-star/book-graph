export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export default async function handler(request) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'sync not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return new Response(JSON.stringify({ error: 'missing code' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = `${SUPABASE_URL}/rest/v1/graphs`;

  if (request.method === 'GET') {
    const res = await fetch(`${base}?code=eq.${encodeURIComponent(code)}&select=data`, {
      headers: supabaseHeaders(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    const rows = await res.json();
    const data = rows[0]?.data ?? null;
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  if (request.method === 'POST') {
    const body = await request.text();
    const res = await fetch(base, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates' }),
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
