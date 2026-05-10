import type { PositionMap } from './positions';

export interface FavoriteLayout {
  id: string;
  name: string;
  positions: PositionMap;
}

const KEY = 'book-graph-favorites';

export function loadFavorites(): FavoriteLayout[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveFavorite(name: string, positions: PositionMap): void {
  const list = loadFavorites();
  list.push({ id: Date.now().toString(), name, positions });
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function deleteFavorite(id: string): void {
  const list = loadFavorites().filter((f) => f.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}
