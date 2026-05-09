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

export function parseBooklogCSV(csvText: string): Book[] {
  const rows = parseCSV(csvText);

  // ヘッダー行を探す（'タイトル'を含む最初の行）
  const headerIdx = rows.findIndex((row) => row.some((cell) => cell.trim() === 'タイトル'));
  if (headerIdx === -1 || headerIdx >= rows.length - 1) return [];

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

    const isbn13 = isbn13Idx >= 0 ? row[isbn13Idx]?.trim().replace(/[-\s]/g, '') : '';
    const author = authorIdx >= 0 ? row[authorIdx]?.trim() : '';
    const yearRaw = yearIdx >= 0 ? parseInt(row[yearIdx]) : NaN;
    const year = isNaN(yearRaw) ? undefined : yearRaw;
    const status = statusIdx >= 0 ? row[statusIdx]?.trim() : '';

    const isbn = isbn13 || undefined;
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
      year,
      read: status === '読んだ' || status === '読んでる',
    });
  }

  return books;
}
