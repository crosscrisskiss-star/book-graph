import type { Book } from '../types';

export interface BookSearchFilters {
  title: string;
  author: string;
  publisher: string;
  category: string;
  rating: string;
  subject: string;
}

export function hasSearchFilters(filters: BookSearchFilters): boolean {
  return Boolean(filters.title.trim() || filters.author.trim() || filters.publisher.trim());
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function includesNeedle(haystack: string | undefined, needle: string): boolean {
  const normalizedNeedle = normalize(needle);
  if (!normalizedNeedle) return true;
  return normalize(haystack).includes(normalizedNeedle);
}

export function matchesBookFilters(book: Book, filters: BookSearchFilters): boolean {
  if (!includesNeedle(book.title, filters.title)) return false;
  if (!includesNeedle(book.authors.join(' '), filters.author)) return false;
  if (!includesNeedle(book.publisher, filters.publisher)) return false;
  if (filters.category !== '' && (book.category ?? '') !== filters.category) return false;
  if (filters.subject !== '' && !book.subjects.some((s) => s === filters.subject)) return false;
  if (filters.rating !== '') {
    if (filters.rating === '0') {
      if (book.rating !== undefined) return false;
    } else {
      if (book.rating !== Number(filters.rating)) return false;
    }
  }
  return true;
}

export function keywordFromFilters(filters: BookSearchFilters): string {
  return [filters.title, filters.author, filters.publisher]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
}
