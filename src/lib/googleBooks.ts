import type { Book } from '../types';

const BASE = 'https://www.googleapis.com/books/v1';

interface GBVolumeInfo {
  title: string;
  authors?: string[];
  publishedDate?: string;
  categories?: string[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  description?: string;
}

interface GBVolume {
  id: string;
  volumeInfo: GBVolumeInfo;
}

function mapVolume(v: GBVolume): Book {
  const info = v.volumeInfo;
  const yearRaw = parseInt((info.publishedDate ?? '').slice(0, 4));
  const rawCover = info.imageLinks?.thumbnail?.replace('http://', 'https://');
  const cover = rawCover?.startsWith('https://books.google.com')
    ? rawCover.replace('https://books.google.com', '/api/google-cover')
    : rawCover;
  return {
    id: `gb_${v.id}`,
    olKey: '',
    title: info.title,
    authors: info.authors ?? [],
    authorKeys: info.authors ?? [],
    subjects: info.categories ?? [],
    series: [],
    coverUrl: cover,
    year: isNaN(yearRaw) ? undefined : yearRaw,
    description: info.description,
  };
}

async function gbSearch(q: string, limit = 10): Promise<Book[]> {
  const params = new URLSearchParams({ q, maxResults: String(limit), printType: 'books' });
  const res = await fetch(`${BASE}/volumes?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.items ?? []) as GBVolume[]).map(mapVolume);
}

export function searchBooksGoogle(query: string, limit = 10) {
  return gbSearch(query, limit);
}

export function getBooksByAuthorGoogle(authorName: string) {
  return gbSearch(`inauthor:"${authorName}"`, 15);
}

export function getBooksBySubjectGoogle(subject: string) {
  return gbSearch(`subject:"${subject}"`, 10);
}
