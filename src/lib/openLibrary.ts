import type { Book } from '../types';

const BASE = 'https://openlibrary.org';

interface OLSearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  subject?: string[];
  cover_i?: number;
  first_publish_year?: number;
  series?: string[];
}

function coverUrl(id?: number): string | undefined {
  return id ? `/api/ol-cover/b/id/${id}-M.jpg` : undefined;
}

function workId(key: string): string {
  return key.replace('/works/', '');
}

function mapDoc(doc: OLSearchDoc): Book {
  return {
    id: workId(doc.key),
    olKey: doc.key,
    title: doc.title,
    authors: doc.author_name ?? [],
    authorKeys: (doc.author_key ?? []).map((k) => k.replace('/authors/', '')),
    subjects: (doc.subject ?? []).slice(0, 20),
    series: doc.series ?? [],
    coverUrl: coverUrl(doc.cover_i),
    year: doc.first_publish_year,
  };
}

export async function searchBooks(query: string, limit = 10): Promise<Book[]> {
  const params = new URLSearchParams({
    q: query,
    fields: 'key,title,author_name,author_key,subject,cover_i,first_publish_year,series',
    limit: String(limit),
  });
  const res = await fetch(`${BASE}/search.json?${params}`);
  const data = await res.json();
  return (data.docs as OLSearchDoc[]).map(mapDoc);
}

export async function getBooksByAuthor(authorKey: string, limit = 15): Promise<Book[]> {
  const res = await fetch(`${BASE}/authors/${authorKey}/works.json?limit=${limit}`);
  const data = await res.json();
  const entries: OLSearchDoc[] = (data.entries ?? []).map((e: { key: string; title: string; covers?: number[]; subjects?: string[]; }) => ({
    key: e.key,
    title: e.title,
    cover_i: e.covers?.[0],
    subject: e.subjects,
  }));
  return entries.filter((e) => e.title).map(mapDoc);
}

export async function getBooksBySubject(subject: string, limit = 10): Promise<Book[]> {
  const slug = subject.toLowerCase().replace(/[\s/]+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!slug) return [];
  try {
    const res = await fetch(`${BASE}/subjects/${slug}.json?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.works ?? []) as Array<{
      key: string;
      title: string;
      authors?: Array<{ name: string; key: string }>;
      cover_id?: number;
      subject?: string[];
      first_publish_year?: number;
    }>).map((w) => ({
      id: workId(w.key),
      olKey: w.key,
      title: w.title,
      authors: (w.authors ?? []).map((a) => a.name),
      authorKeys: (w.authors ?? []).map((a) => a.key.replace('/authors/', '')),
      subjects: w.subject ?? [],
      series: [],
      coverUrl: w.cover_id ? coverUrl(w.cover_id) : undefined,
      year: w.first_publish_year,
    }));
  } catch {
    return [];
  }
}
