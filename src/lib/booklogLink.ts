import type { Book } from '../types';

export function booklogSearchUrl(book: Book): string {
  const isbn = book.isbn?.replace(/[-\s]/g, '');
  const keyword = isbn || [book.title, book.authors?.[0]].filter(Boolean).join(' ');
  const params = new URLSearchParams({
    keyword,
    service_id: '1',
    index: 'Books',
  });

  return `https://booklog.jp/search?${params.toString()}`;
}
