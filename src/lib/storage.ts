import type { GraphData } from '../types';

const KEY = 'book-graph-data';

const empty: GraphData = { books: [], relationships: [] };

function sheetKey(sheetId: string): string {
  return sheetId === 'default' ? KEY : `${KEY}:${sheetId}`;
}

export function normalizeGraphData(data: GraphData): GraphData {
  return {
    ...data,
    drawStrokes: data.drawVersion === 2 ? (data.drawStrokes ?? []) : [],
    drawVersion: 2,
    favorites: data.favorites?.map((favorite) => ({
      ...favorite,
      drawStrokes: favorite.drawVersion === 2 ? (favorite.drawStrokes ?? []) : [],
      drawVersion: 2,
    })),
  };
}

export function loadGraph(sheetId = 'default'): GraphData {
  try {
    const raw = localStorage.getItem(sheetKey(sheetId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as GraphData;
    const graph = normalizeGraphData(parsed);
    if (parsed.drawVersion !== 2) saveGraph(graph, sheetId);
    return graph;
  } catch {
    return empty;
  }
}

export function saveGraph(data: GraphData, sheetId = 'default'): void {
  localStorage.setItem(sheetKey(sheetId), JSON.stringify(data));
}
