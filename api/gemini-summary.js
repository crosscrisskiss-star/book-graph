const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf-8');
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (!GEMINI_API_KEY) return json(res, 503, { error: 'GEMINI_API_KEY not configured' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method not allowed' });
  }

  const body = await readBody(req);
  const { title, author, subjects, description } = body;
  if (!title) return json(res, 400, { error: 'title is required' });

  const lines = [
    `タイトル: ${title}`,
    `著者: ${author || '不明'}`,
    Array.isArray(subjects) && subjects.length > 0
      ? `ジャンル: ${subjects.slice(0, 6).join(', ')}`
      : '',
    description ? `内容説明（参考）: ${String(description).slice(0, 600)}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `次の本について、日本語で200〜300字程度の要約を書いてください。内容・テーマ・読みどころを簡潔にまとめてください。

${lines}

要約文のみを出力してください。前置きや「この本は〜」のような書き出しも省いて、内容の説明から始めてください。`;

  // Discover available models
  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=50`
  );
  const listData = await listRes.json();
  if (!listRes.ok) {
    return json(res, 503, { error: `Gemini auth failed: ${listData?.error?.message ?? ''}` });
  }

  const PREFER = ['gemini-1.5-flash-8b', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-pro'];
  const available = (listData.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''));

  if (available.length === 0) return json(res, 503, { error: 'Gemini: 対応モデルなし' });

  const ordered = [];
  const seen = new Set();
  for (const pref of PREFER) {
    const match = available.find((a) => a === pref || a.startsWith(`${pref}-`));
    if (match && !seen.has(match)) { ordered.push(match); seen.add(match); }
  }
  for (const m of available) { if (!seen.has(m)) ordered.push(m); }

  let lastError = 'no models tried';

  for (const model of ordered) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        lastError = `${model}: ${data?.error?.message ?? response.status}`;
        continue;
      }

      const summary = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
      if (!summary) { lastError = `${model}: empty response`; continue; }

      return json(res, 200, { summary });
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return json(res, 503, { error: `Gemini: ${lastError}` });
}
