export interface GeminiRecommendation {
  title: string;
  author: string;
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
