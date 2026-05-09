const KEY = 'book-graph-positions';

export type PositionMap = Record<string, { x: number; y: number }>;

export function loadPositions(): PositionMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as PositionMap;
  } catch {
    return {};
  }
}

export function savePositions(positions: PositionMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(positions));
  } catch { /* quota exceeded */ }
}
