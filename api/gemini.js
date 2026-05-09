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
  if (!GEMINI_API_KEY) {
    return json(res, 503, { error: 'GEMINI_API_KEY not configured' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method not allowed' });
  }

  const body = await readBody(req);
  const { title, author, subjects } = body;

  if (!title) {
    return json(res, 400, { error: 'title is required' });
  }

  const subjectLine = Array.isArray(subjects) && subjects.length > 0
    ? `ジャンル・テーマ: ${subjects.slice(0, 4).join(', ')}`
    : '';

  const prompt = `次の本に似た、おすすめの本を2冊教えてください。

タイトル: ${title}
著者: ${author || '不明'}
${subjectLine}

以下のJSON配列形式のみで回答してください。説明文・コードブロック記号は不要です:
[{"title": "タイトル1", "author": "著者名1"}, {"title": "タイトル2", "author": "著者名2"}]`;

  // Discover available models for this API key
  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=50`
  );
  const listData = await listRes.json();
  if (!listRes.ok) {
    const detail = listData?.error?.message ?? JSON.stringify(listData);
    return json(res, 503, { error: `Gemini auth failed: ${detail}` });
  }

  // Free-tier friendly models first
  const PREFER = ['gemini-1.5-flash-8b', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-pro'];

  const available = (listData.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''));

  if (available.length === 0) {
    return json(res, 503, { error: 'Gemini: generateContent に対応したモデルがありません' });
  }

  // Build ordered list: preferred matches first, then remaining
  const ordered = [];
  const seen = new Set();
  for (const prefix of PREFER) {
    const match = available.find((a) => a === prefix || a.startsWith(`${prefix}-`));
    if (match && !seen.has(match)) { ordered.push(match); seen.add(match); }
  }
  for (const m of available) {
    if (!seen.has(m)) ordered.push(m);
  }

  let lastError = `no models tried (available: ${available.slice(0, 5).join(', ')})`;

  for (const model of ordered) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        lastError = `${model}: ${data?.error?.message ?? response.status}`;
        continue; // quota / not found → try next model
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        return json(res, 500, { error: `Gemini returned no JSON array (model: ${model})` });
      }

      const recommendations = JSON.parse(arrayMatch[0]);
      if (!Array.isArray(recommendations)) {
        return json(res, 500, { error: 'unexpected Gemini response format' });
      }

      return json(res, 200, recommendations.slice(0, 2));
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return json(res, 503, { error: `Gemini: ${lastError}` });
}
