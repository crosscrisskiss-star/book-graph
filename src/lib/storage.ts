import type { GraphData } from '../types';

const KEY = 'book-graph-data';

const empty: GraphData = { books: [], relationships: [] };

export function loadGraph(): GraphData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GraphData) : empty;
  } catch {
    return empty;
  }
}

export function saveGraph(data: GraphData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}
