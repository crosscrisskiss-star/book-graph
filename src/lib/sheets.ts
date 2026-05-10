const SHEETS_KEY = 'book-graph-sheets';
const CURRENT_KEY = 'book-graph-current-sheet';

export interface Sheet {
  id: string;
  name: string;
}

export function loadSheets(): Sheet[] {
  try {
    const data = JSON.parse(localStorage.getItem(SHEETS_KEY) ?? 'null');
    if (Array.isArray(data) && data.length > 0) return data as Sheet[];
  } catch {}
  return [{ id: 'default', name: 'メイン' }];
}

export function saveSheets(sheets: Sheet[]): void {
  try { localStorage.setItem(SHEETS_KEY, JSON.stringify(sheets)); } catch {}
}

export function loadCurrentSheetId(): string {
  return localStorage.getItem(CURRENT_KEY) ?? 'default';
}

export function saveCurrentSheetId(id: string): void {
  try { localStorage.setItem(CURRENT_KEY, id); } catch {}
}

export function deleteSheetData(sheetId: string): void {
  if (sheetId === 'default') return;
  for (const base of ['book-graph-data', 'book-graph-positions', 'book-graph-viewport', 'book-graph-favorites']) {
    localStorage.removeItem(`${base}:${sheetId}`);
  }
}
