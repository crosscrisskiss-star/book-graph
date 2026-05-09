import type { Book } from '../types';

export interface BookSearchFilters {
  title: string;
  author: string;
  publisher: string;
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
  return (
    includesNeedle(book.title, filters.title) &&
    includesNeedle(book.authors.join(' '), filters.author) &&
    includesNeedle(book.publisher, filters.publisher)
  );
}

export function keywordFromFilters(filters: BookSearchFilters): string {
  return [filters.title, filters.author, filters.publisher]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
}
