export interface GeminiRecommendation {
  title: string;
  author: string;
}

export async function getGeminiSummary(
  title: string,
  author: string,
  subjects: string[],
  description?: string
): Promise<string> {
  const res = await fetch('/api/gemini-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author, subjects, description }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Gemini API ${res.status}`);
  return data.summary ?? '';
}

export async function getGeminiRecommendations(
  title: string,
  author: string,
  subjects: string[]
): Promise<GeminiRecommendation[]> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author, subjects }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Gemini API ${res.status}`);
  }

  return res.json();
}
