import type { PositionMap } from './positions';
import type { DrawStroke, FavoriteSyncItem } from '../types';

export type FavoriteLayout = FavoriteSyncItem & { positions: PositionMap };

const KEY = 'book-graph-favorites';

function favKey(sheetId: string): string {
  return sheetId === 'default' ? KEY : `${KEY}:${sheetId}`;
}

export function loadFavorites(sheetId = 'default'): FavoriteLayout[] {
  try {
    const list = JSON.parse(localStorage.getItem(favKey(sheetId)) ?? '[]') as FavoriteLayout[];
    const normalized = list.map((favorite) => ({
      ...favorite,
      drawStrokes: favorite.drawVersion === 2 ? (favorite.drawStrokes ?? []) : [],
      drawVersion: 2 as const,
    }));
    if (list.some((favorite) => favorite.drawVersion !== 2)) {
      try { localStorage.setItem(favKey(sheetId), JSON.stringify(normalized)); } catch { /* quota */ }
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveFavorite(name: string, positions: PositionMap, drawStrokes?: DrawStroke[], sheetId = 'default'): void {
  const list = loadFavorites(sheetId);
  list.push({ id: Date.now().toString(), name, positions, drawStrokes: drawStrokes ?? [], drawVersion: 2 });
  try { localStorage.setItem(favKey(sheetId), JSON.stringify(list)); } catch { /* quota */ }
}

export function deleteFavorite(id: string, sheetId = 'default'): void {
  const list = loadFavorites(sheetId).filter((f) => f.id !== id);
  try { localStorage.setItem(favKey(sheetId), JSON.stringify(list)); } catch { /* quota */ }
}
