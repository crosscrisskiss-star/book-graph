export interface Book {
  id: string;
  title: string;
  authors: string[];
  authorKeys: string[];
  subjects: string[];
  series: string[];
  coverUrl?: string;
  year?: number;
  category?: string;
  publisher?: string;
  description?: string;
  olKey: string;
  isbn?: string;
  read?: boolean;
  rating?: number;
  privateMemo?: string;
  aiSummary?: string;
}

export type RelationshipType =
  | 'author'
  | 'series'
  | 'genre'
  | 'recommendation'
  | 'reference'
  | 'category'
  | 'manual';

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  label?: string;
}

export interface GraphData {
  books: Book[];
  relationships: Relationship[];
  categories?: string[];
}

export const REL_COLORS: Record<RelationshipType, string> = {
  author: '#3B82F6',
  series: '#8B5CF6',
  genre: '#10B981',
  recommendation: '#F59E0B',
  reference: '#EF4444',
  category: '#F97316',
  manual: '#9CA3AF',
};

export const REL_LABELS: Record<RelationshipType, string> = {
  author: '同著者',
  series: 'シリーズ',
  genre: 'ジャンル',
  recommendation: 'おすすめ',
  reference: '引用・参考',
  category: 'カテゴリ',
  manual: '手動',
};
