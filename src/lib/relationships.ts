import type { Book, Relationship, RelationshipType } from '../types';

function relId(source: string, target: string, type: RelationshipType): string {
  return `${[source, target].sort().join('--')}::${type}`;
}

function list(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export function detectRelationships(
  existing: Book[],
  newBook: Book,
  enabledTypes: Set<RelationshipType>
): Relationship[] {
  const rels: Relationship[] = [];

  for (const book of existing) {
    if (book.id === newBook.id) continue;

    if (enabledTypes.has('author')) {
      const bookAuthorKeys = list(book.authorKeys);
      const newAuthorKeys = list(newBook.authorKeys);
      const sharedAuthors = newAuthorKeys.filter((k) => bookAuthorKeys.includes(k));
      if (sharedAuthors.length > 0) {
        rels.push({
          id: relId(book.id, newBook.id, 'author'),
          source: book.id,
          target: newBook.id,
          type: 'author',
          label: list(newBook.authors)[0],
        });
      }
    }

    if (enabledTypes.has('series')) {
      const bookSeries = list(book.series);
      const newSeries = list(newBook.series);
      const sharedSeries = newSeries.filter((s) => bookSeries.includes(s));
      if (sharedSeries.length > 0) {
        rels.push({
          id: relId(book.id, newBook.id, 'series'),
          source: book.id,
          target: newBook.id,
          type: 'series',
          label: sharedSeries[0],
        });
      }
    }

    if (enabledTypes.has('genre') || enabledTypes.has('theme')) {
      const bookSubjects = list(book.subjects);
      const newSubjects = list(newBook.subjects);
      const normalizedBookSubjects = bookSubjects.map((x) => x.toLowerCase());
      const sharedSubjects = newSubjects.filter((s) =>
        normalizedBookSubjects.includes(s.toLowerCase())
      );
      if (sharedSubjects.length >= 2) {
        const type: RelationshipType = sharedSubjects.length >= 4 ? 'theme' : 'genre';
        if (enabledTypes.has(type)) {
          rels.push({
            id: relId(book.id, newBook.id, type),
            source: book.id,
            target: newBook.id,
            type,
            label: sharedSubjects.slice(0, 2).join(', '),
          });
        }
      }
    }
  }

  return rels;
}

export function dedupeRelationships(rels: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  return rels.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
