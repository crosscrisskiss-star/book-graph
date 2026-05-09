const DEFAULT_SUPABASE_URL = 'https://feunhzhpokplyqmfqdvz.supabase.co';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf-8');
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (!SUPABASE_KEY) {
    return json(res, 503, {
      error: 'sync not configured',
      detail: 'Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, or VITE_SUPABASE_ANON_KEY in Vercel environment variables.',
    });
  }

  const code = normalizeCode(req.query?.code);
  if (!code) return json(res, 400, { error: 'missing code' });

  const base = `${SUPABASE_URL}/rest/v1/graphs`;

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${base}?code=eq.${encodeURIComponent(code)}&select=data`, {
        headers: supabaseHeaders(),
      });

      const text = await response.text();
      if (!response.ok) {
        return json(res, response.status, {
          error: 'supabase load failed',
          detail: text,
        });
      }

      const rows = text ? JSON.parse(text) : [];
      return json(res, 200, rows[0]?.data ?? null);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const graph = body?.data ?? body;

      const response = await fetch(`${base}?on_conflict=code`, {
        method: 'POST',
        headers: supabaseHeaders({
          Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify({
          code,
          data: graph,
          updated_at: new Date().toISOString(),
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        return json(res, response.status, {
          error: 'supabase save failed',
          detail: text,
        });
      }

      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'method not allowed' });
  } catch (error) {
    return json(res, 500, {
      error: 'sync failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
