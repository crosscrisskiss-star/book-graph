import type { Book } from '../types';
import type { BookSearchFilters } from './bookSearchFilters';
import { keywordFromFilters, matchesBookFilters } from './bookSearchFilters';

const BASE = 'https://www.googleapis.com/books/v1';

interface GBVolumeInfo {
  title: string;
  authors?: string[];
  publishedDate?: string;
  publisher?: string;
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
    publisher: info.publisher,
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

export async function searchBooksGoogleFiltered(filters: BookSearchFilters, limit = 20) {
  const parts = [
    filters.title.trim() ? `intitle:"${filters.title.trim()}"` : '',
    filters.author.trim() ? `inauthor:"${filters.author.trim()}"` : '',
    filters.publisher.trim() ? `inpublisher:"${filters.publisher.trim()}"` : '',
  ].filter(Boolean);
  const query = parts.join(' ') || keywordFromFilters(filters);
  const books = await gbSearch(query, limit);
  return books.filter((book) => matchesBookFilters(book, filters));
}

export function getBooksByAuthorGoogle(authorName: string) {
  return gbSearch(`inauthor:"${authorName}"`, 15);
}

export function getBooksBySubjectGoogle(subject: string) {
  return gbSearch(`subject:"${subject}"`, 10);
}
