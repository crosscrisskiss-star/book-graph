import type { RelationshipType } from '../types';
import { REL_COLORS, REL_LABELS } from '../types';

const ALL_TYPES: RelationshipType[] = [
  'author',
  'series',
  'genre',
  'recommendation',
  'reference',
  'theme',
  'manual',
];

interface Props {
  enabled: Set<RelationshipType>;
  onChange: (type: RelationshipType) => void;
}

export function RelationshipFilter({ enabled, onChange }: Props) {
  return (
    <div className="filter-panel">
      <div className="panel-title">{'\u95a2\u4fc2\u6027\u30d5\u30a3\u30eb\u30bf\u30fc'}</div>
      {ALL_TYPES.map((type) => (
        <label key={type} className="filter-item">
          <input
            type="checkbox"
            checked={enabled.has(type)}
            onChange={() => onChange(type)}
          />
          <span
            className="filter-dot"
            style={{ background: REL_COLORS[type] }}
          />
          {REL_LABELS[type]}
        </label>
      ))}
    </div>
  );
}
