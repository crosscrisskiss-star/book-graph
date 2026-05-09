import type { GraphData } from '../types';

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
  return res.json();
}

export async function cloudSave(code: string, graph: GraphData): Promise<void> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, data: graph }),
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
