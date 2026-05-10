const KEY = 'book-graph-positions';
const VIEWPORT_KEY = 'book-graph-viewport';

export type PositionMap = Record<string, { x: number; y: number }>;
export type ViewportState = {
  zoom: number;
  pan: { x: number; y: number };
};

function posKey(sheetId: string): string {
  return sheetId === 'default' ? KEY : `${KEY}:${sheetId}`;
}

function vpKey(sheetId: string): string {
  return sheetId === 'default' ? VIEWPORT_KEY : `${VIEWPORT_KEY}:${sheetId}`;
}

export function loadPositions(sheetId = 'default'): PositionMap {
  try {
    return JSON.parse(localStorage.getItem(posKey(sheetId)) ?? '{}') as PositionMap;
  } catch {
    return {};
  }
}

export function savePositions(positions: PositionMap, sheetId = 'default'): void {
  try {
    localStorage.setItem(posKey(sheetId), JSON.stringify(positions));
  } catch { /* quota exceeded */ }
}

export function loadViewport(sheetId = 'default'): ViewportState | null {
  try {
    const raw = localStorage.getItem(vpKey(sheetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewportState;
    if (
      typeof parsed.zoom !== 'number' ||
      typeof parsed.pan?.x !== 'number' ||
      typeof parsed.pan?.y !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveViewport(viewport: ViewportState, sheetId = 'default'): void {
  try {
    localStorage.setItem(vpKey(sheetId), JSON.stringify(viewport));
  } catch { /* quota exceeded */ }
}
