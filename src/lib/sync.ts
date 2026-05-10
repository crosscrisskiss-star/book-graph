import type { GraphData } from '../types';
import { loadPositions, savePositions } from './positions';
import { loadFavorites } from './favorites';

const FAV_KEY = 'book-graph-favorites';

export function isSyncConfigured(): boolean {
  return true;
}

export async function cloudLoad(code: string): Promise<GraphData | null> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`);
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`load ${res.status}: ${body}`);
  }
  const data: GraphData = await res.json();

  // Restore positions to localStorage (merge with existing to preserve any local-only nodes)
  if (data.positions && Object.keys(data.positions).length > 0) {
    const merged = { ...loadPositions(), ...data.positions };
    savePositions(merged);
  }
  // Restore favorites (remote wins — overwrite local)
  if (Array.isArray(data.favorites) && data.favorites.length > 0) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(data.favorites)); } catch { /* quota */ }
  }

  return data;
}

export async function cloudSave(code: string, graph: GraphData): Promise<void> {
  const dataToSave: GraphData = {
    ...graph,
    positions: loadPositions(),
    favorites: loadFavorites(),
  };

  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, data: dataToSave }),
  });
  if (res.status === 503) throw new Error('sync not configured on server');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`save ${res.status}: ${body}`);
  }
}

const CODE_KEY = 'syncCode';
export function loadSyncCode(): string | null { return localStorage.getItem(CODE_KEY); }
export function saveSyncCode(code: string): void { localStorage.setItem(CODE_KEY, code); }
export function clearSyncCode(): void { localStorage.removeItem(CODE_KEY); }

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
