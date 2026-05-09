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

  // Try models in order until one succeeds
  const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

  let lastError = '';
  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        lastError = data?.error?.message ?? JSON.stringify(data);
        continue; // try next model
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // Extract JSON array from the response (strip markdown fences, find first [...])
      const cleaned = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) {
        return json(res, 500, { error: `Gemini returned no JSON array (model: ${model})` });
      }

      const recommendations = JSON.parse(match[0]);
      if (!Array.isArray(recommendations)) {
        return json(res, 500, { error: 'unexpected Gemini response format' });
      }

      return json(res, 200, recommendations.slice(0, 2));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return json(res, 503, { error: `Gemini: ${lastError}` });
}
