interface BooklogBook {
  category_name?: string;
}

interface BooklogResponse {
  books?: BooklogBook[];
}

export async function getBooklogGenre(isbn: string): Promise<string | null> {
  const clean = isbn.replace(/[-\s]/g, '');
  if (!clean) return null;
  try {
    const res = await fetch(`/api/booklog/v2/json/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data: BooklogResponse = await res.json();
    const name = data?.books?.[0]?.category_name?.trim() || null;
    return name ?? null;
  } catch {
    return null;
  }
}
