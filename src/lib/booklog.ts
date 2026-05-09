import type { Book } from '../types';

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
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
  const content = text.startsWith('﻿') ? text.slice(1) : text;
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCSVLine);
}

function isRead(status: string): boolean {
  return ['読んだ', '読んでる', '読み終わった', 'read', 'currently-reading'].includes(status.trim());
}

// 旧ブクログ形式（固定列順、ヘッダーなし）
// 0:id, 1:isbn10, 2:isbn13, 3:genre, 4:rating, 5:status, 6-8:tags, 9:date1, 10:date2, 11:title, 12:author, 13:publisher, 14:year, 15:type, 16:pages
const OLD_POS = { isbn13: 2, status: 5, title: 11, author: 12, year: 14 };

function parsePositional(rows: string[][]): Book[] {
  const books: Book[] = [];
  for (const row of rows) {
    if (row.length < 13) continue;
    const title = row[OLD_POS.title]?.trim();
    if (!title || title === 'タイトル') continue;
    const isbn = row[OLD_POS.isbn13]?.trim().replace(/[-\s]/g, '') || undefined;
    const author = row[OLD_POS.author]?.trim() ?? '';
    const yearRaw = parseInt(row[OLD_POS.year]);
    const status = row[OLD_POS.status]?.trim() ?? '';
    const id = isbn
      ? `isbn_${isbn}`
      : `booklog_${title}_${author}`.replace(/\s+/g, '_').slice(0, 80);
    books.push({
      id,
      title,
      authors: author ? [author] : [],
      authorKeys: [],
      subjects: [],
      series: [],
      olKey: '',
      isbn,
      coverUrl: isbn ? `/api/books-cover/${isbn}.jpg` : undefined,
      year: isNaN(yearRaw) ? undefined : yearRaw,
      read: isRead(status),
    });
  }
  return books;
}

export function parseBooklogCSV(csvText: string): Book[] {
  const rows = parseCSV(csvText);

  // 新形式：ヘッダー行に「タイトル」を含む行を探す
  const headerIdx = rows.findIndex((row) => row.some((cell) => cell.trim() === 'タイトル'));

  if (headerIdx !== -1 && headerIdx < rows.length - 1) {
    const header = rows[headerIdx].map((h) => h.trim());
    const col = (name: string) => header.indexOf(name);
    const titleIdx = col('タイトル');
    const authorIdx = col('著者名');
    const isbn13Idx = col('13桁ISBN');
    const yearIdx = col('発行年');
    const statusIdx = col('読書状況');
    const books: Book[] = [];
    for (const row of rows.slice(headerIdx + 1)) {
      const title = row[titleIdx]?.trim();
      if (!title) continue;
      const isbn = isbn13Idx >= 0 ? row[isbn13Idx]?.trim().replace(/[-\s]/g, '') || undefined : undefined;
      const author = authorIdx >= 0 ? row[authorIdx]?.trim() ?? '' : '';
      const yearRaw = yearIdx >= 0 ? parseInt(row[yearIdx]) : NaN;
      const status = statusIdx >= 0 ? row[statusIdx]?.trim() ?? '' : '';
      const id = isbn
        ? `isbn_${isbn}`
        : `booklog_${title}_${author}`.replace(/\s+/g, '_').slice(0, 80);
      books.push({
        id,
        title,
        authors: author ? [author] : [],
        authorKeys: [],
        subjects: [],
        series: [],
        olKey: '',
        isbn,
        coverUrl: isbn ? `/api/books-cover/${isbn}.jpg` : undefined,
        year: isNaN(yearRaw) ? undefined : yearRaw,
        read: isRead(status),
      });
    }
    return books;
  }

  // 旧形式（ヘッダーなし固定列）
  return parsePositional(rows);
}
