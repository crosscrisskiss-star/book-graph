import type { PositionMap } from './positions';
import type { DrawStroke, FavoriteSyncItem } from '../types';

export type FavoriteLayout = FavoriteSyncItem & { positions: PositionMap };

const KEY = 'book-graph-favorites';

export function loadFavorites(): FavoriteLayout[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveFavorite(name: string, positions: PositionMap, drawStrokes?: DrawStroke[]): void {
  const list = loadFavorites();
  list.push({ id: Date.now().toString(), name, positions, drawStrokes: drawStrokes ?? [] });
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function deleteFavorite(id: string): void {
  const list = loadFavorites().filter((f) => f.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}
