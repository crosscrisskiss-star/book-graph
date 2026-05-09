import type { Book } from '../types';

const BOOKLOG_POS = {
  isbn13: 2,
  category: 3,
  rating: 4,
  status: 5,
  privateMemo: 8,
  title: 11,
  author: 12,
  publisher: 13,
  year: 14,
};

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '').replace(/^・ｿ/, '');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCSVLine);
}

function isRead(status: string): boolean {
  return [
    '読んだ',
    '読んでる',
    '読み終わった',
    '隱ｭ繧薙□',
    '隱ｭ繧薙〒繧・',
    '隱ｭ縺ｿ邨ゅｏ縺｣縺・',
    'read',
    'currently-reading',
  ].includes(status.trim());
}

function parseRating(value: string | undefined): number | undefined {
  const rating = Number(value?.trim());
  if (!Number.isFinite(rating) || rating <= 0) return undefined;
  return Math.min(5, Math.max(1, rating));
}

function isTitleHeader(value: string | undefined): boolean {
  const text = value?.trim();
  return text === 'タイトル' || text === '繧ｿ繧､繝医Ν';
}

function findColumn(header: string[], names: string[], fallback: number): number {
  const index = header.findIndex((cell) => names.includes(cell.trim()));
  return index >= 0 ? index : fallback;
}

function bookFromRow(row: string[], indexes = BOOKLOG_POS): Book | null {
  const title = row[indexes.title]?.trim();
  if (!title || isTitleHeader(title)) return null;

  const isbn = row[indexes.isbn13]?.trim().replace(/[-\s]/g, '') || undefined;
  const author = row[indexes.author]?.trim() ?? '';
  const category = row[indexes.category]?.trim() || undefined;
  const publisher = row[indexes.publisher]?.trim() || undefined;
  const yearRaw = parseInt(row[indexes.year], 10);
  const status = row[indexes.status]?.trim() ?? '';
  const rating = parseRating(row[indexes.rating]);
  const privateMemo = row[indexes.privateMemo]?.trim() || undefined;
  const id = isbn
    ? `isbn_${isbn}`
    : `booklog_${title}_${author}`.replace(/\s+/g, '_').slice(0, 80);

  return {
    id,
    title,
    authors: author ? [author] : [],
    authorKeys: [],
    subjects: [],
    series: [],
    olKey: '',
    isbn,
    coverUrl: isbn ? `/api/books-cover/${isbn}.jpg` : undefined,
    year: Number.isNaN(yearRaw) ? undefined : yearRaw,
    category,
    publisher,
    read: isRead(status),
    rating,
    privateMemo,
  };
}

export function parseBooklogCSV(csvText: string): Book[] {
  const rows = parseCSV(csvText);
  const headerIdx = rows.findIndex((row) => row.some(isTitleHeader));

  if (headerIdx !== -1 && headerIdx < rows.length - 1) {
    const header = rows[headerIdx].map((cell) => cell.trim());
    const indexes = {
      isbn13: findColumn(header, ['13桁ISBN', '13譯！SBN'], BOOKLOG_POS.isbn13),
      category: findColumn(header, ['カテゴリ', '繧ｫ繝・ざ繝ｪ'], BOOKLOG_POS.category),
      rating: findColumn(header, ['評価', '隧穂ｾ｡'], BOOKLOG_POS.rating),
      status: findColumn(header, ['読書状況', '隱ｭ譖ｸ迥ｶ豕・'], BOOKLOG_POS.status),
      privateMemo: findColumn(header, ['非公開メモ', '読書メモ(非公開)', '隱ｭ譖ｸ繝｡繝｢(髱槫・髢・)'], BOOKLOG_POS.privateMemo),
      title: findColumn(header, ['タイトル', '繧ｿ繧､繝医Ν'], BOOKLOG_POS.title),
      author: findColumn(header, ['作者名', '著者名', '闡苓・錐'], BOOKLOG_POS.author),
      publisher: findColumn(header, ['出版社名', '出版社', '蜃ｺ迚育､ｾ蜷・'], BOOKLOG_POS.publisher),
      year: findColumn(header, ['発行年', '逋ｺ陦悟ｹｴ'], BOOKLOG_POS.year),
    };

    return rows
      .slice(headerIdx + 1)
      .map((row) => bookFromRow(row, indexes))
      .filter((book): book is Book => book !== null);
  }

  return rows
    .map((row) => bookFromRow(row))
    .filter((book): book is Book => book !== null);
}
