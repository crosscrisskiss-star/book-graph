import type { Book } from '../types';

const BASE = '/api/ndl/opensearch';
const DC = 'http://purl.org/dc/elements/1.1/';
const SEARCH_TIMEOUT_MS = 6000;

function textNS(el: Element, ns: string, local: string): string {
  return el.getElementsByTagNameNS(ns, local)[0]?.textContent?.trim() ?? '';
}

function allTextNS(el: Element, ns: string, local: string): string[] {
  return Array.from(el.getElementsByTagNameNS(ns, local))
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean);
}

function coverUrl(isbn: string): string {
  return `/api/books-cover/${isbn}.jpg`;
}

function extractIsbn(identifiers: string[]): string | undefined {
  for (const id of identifiers) {
    const cleaned = id.replace(/[-\s]/g, '').toUpperCase();
    if (/^\d{9}[\dX]$/.test(cleaned) || /^\d{13}$/.test(cleaned)) return cleaned;

    const match = id.match(/ISBN\s*([0-9Xx\-\s]{10,20})/);
    if (!match) continue;

    const raw = match[1].replace(/[-\s]/g, '').toUpperCase();
    if (/^\d{9}[\dX]$/.test(raw) || /^\d{13}$/.test(raw)) return raw;
  }
  return undefined;
}

function parseAuthor(raw: string): string {
  return raw
    .replace(/,\s*\d{4}-\d{0,4}$/, '')
    .replace(/,\s*/g, ' ')
    .trim();
}

function parseItems(xml: string): Book[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  if (doc.querySelector('parsererror')) return [];

  return Array.from(doc.getElementsByTagName('item'))
    .map((item): Book | null => {
      const title = item.getElementsByTagName('title')[0]?.textContent?.trim() ?? '';
      if (!title) return null;

      const creatorRaw = textNS(item, DC, 'creator');
      const dateRaw = textNS(item, DC, 'date');
      const identifiers = allTextNS(item, DC, 'identifier');
      const subjects = allTextNS(item, DC, 'subject');
      const isbn = extractIsbn(identifiers);
      const year = parseInt(dateRaw.slice(0, 4), 10);
      const authors = creatorRaw
        ? creatorRaw.split(/[;；／/、]/).map((author) => parseAuthor(author)).filter(Boolean)
        : [];

      return {
        id: `ndl_${isbn ?? encodeURIComponent(title).slice(0, 40)}`,
        olKey: '',
        title,
        authors,
        authorKeys: authors,
        subjects,
        series: [],
        coverUrl: isbn ? coverUrl(isbn) : undefined,
        year: Number.isNaN(year) ? undefined : year,
        isbn,
      };
    })
    .filter((book): book is Book => book !== null);
}

async function ndlSearch(params: Record<string, string>, count = 15): Promise<Book[]> {
  const p = new URLSearchParams({ cnt: String(count), dpid: 'iss-ndl-opac', ...params });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}?${p}`, { signal: controller.signal });
    if (!res.ok) {
      console.error('[NDL] HTTP error:', res.status, res.statusText);
      return [];
    }

    const xml = await res.text();
    return parseItems(xml);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('[NDL] search timed out');
    } else {
      console.error('[NDL] search failed:', err);
    }
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

function dedupeBooks(books: Book[]): Book[] {
  const seen = new Set<string>();
  return books.filter((book) => {
    if (seen.has(book.id)) return false;
    seen.add(book.id);
    return true;
  });
}

export async function searchBooksNDL(query: string): Promise<Book[]> {
  const [byTitle, byCreator] = await Promise.all([
    ndlSearch({ title: query }, 30),
    ndlSearch({ creator: query }, 20),
  ]);
  return dedupeBooks([...byTitle, ...byCreator]);
}

export function getBooksByAuthorNDL(author: string): Promise<Book[]> {
  return ndlSearch({ creator: author }, 20);
}

export function getBooksBySubjectNDL(subject: string): Promise<Book[]> {
  return ndlSearch({ any: subject }, 15);
}
