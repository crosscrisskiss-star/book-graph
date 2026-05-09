/// <reference types="vite/client" />
import type { GraphData } from '../types';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSyncConfigured(): boolean {
  return Boolean(URL_ && KEY);
}

async function rest(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${URL_}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
}

export async function cloudLoad(code: string): Promise<GraphData | null> {
  const res = await rest(`/graphs?code=eq.${encodeURIComponent(code)}&select=data`);
  if (!res.ok) return null;
  const rows: { data: GraphData }[] = await res.json();
  return rows[0]?.data ?? null;
}

export async function cloudSave(code: string, graph: GraphData): Promise<void> {
  await rest('/graphs', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' } as Record<string, string>,
    body: JSON.stringify({ code, data: graph }),
  });
}

const CODE_KEY = 'syncCode';
export function loadSyncCode(): string | null { return localStorage.getItem(CODE_KEY); }
export function saveSyncCode(code: string): void { localStorage.setItem(CODE_KEY, code); }
export function clearSyncCode(): void { localStorage.removeItem(CODE_KEY); }

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
