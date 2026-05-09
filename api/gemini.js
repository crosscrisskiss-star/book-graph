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

必ずJSON配列のみで返してください（前後に説明文を付けないこと）:
[{"title": "タイトル1", "author": "著者名1"}, {"title": "タイトル2", "author": "著者名2"}]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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
      const detail = data?.error?.message ?? JSON.stringify(data);
      return json(res, response.status, { error: `Gemini: ${detail}` });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    // strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const recommendations = JSON.parse(cleaned);
    if (!Array.isArray(recommendations)) {
      return json(res, 500, { error: 'unexpected Gemini response format' });
    }

    return json(res, 200, recommendations.slice(0, 2));
  } catch (error) {
    return json(res, 500, {
      error: 'gemini request failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
