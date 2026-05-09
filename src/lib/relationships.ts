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

    if (enabledTypes.has('genre')) {
      const bookSubjects = list(book.subjects);
      const newSubjects = list(newBook.subjects);
      const normalizedBookSubjects = bookSubjects.map((x) => x.toLowerCase());
      const sharedSubjects = newSubjects.filter((s) =>
        normalizedBookSubjects.includes(s.toLowerCase())
      );
      if (sharedSubjects.length >= 2) {
        rels.push({
          id: relId(book.id, newBook.id, 'genre'),
          source: book.id,
          target: newBook.id,
          type: 'genre',
          label: sharedSubjects.slice(0, 2).join(', '),
        });
      }
    }

    if (enabledTypes.has('category')) {
      const bookCat = book.category?.trim();
      const newCat = newBook.category?.trim();
      if (bookCat && newCat && bookCat === newCat) {
        rels.push({
          id: relId(book.id, newBook.id, 'category'),
          source: book.id,
          target: newBook.id,
          type: 'category',
          label: bookCat,
        });
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

export function detectAllRelationships(
  books: Book[],
  enabledTypes: Set<RelationshipType>
): Relationship[] {
  const rels: Relationship[] = [];

  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const a = books[i];
      const b = books[j];

      if (enabledTypes.has('author')) {
        const aKeys = list(a.authorKeys);
        const bKeys = list(b.authorKeys);
        const sharedKeys = aKeys.length > 0 && bKeys.length > 0
          ? aKeys.filter((k) => bKeys.includes(k))
          : [];

        // Fallback: match by author name string when no authorKeys
        const aNames = list(a.authors).map((n) => n.trim().toLowerCase()).filter(Boolean);
        const bNames = list(b.authors).map((n) => n.trim().toLowerCase()).filter(Boolean);
        const sharedNames = aNames.length > 0 && bNames.length > 0
          ? aNames.filter((n) => bNames.includes(n))
          : [];

        if (sharedKeys.length > 0 || sharedNames.length > 0) {
          rels.push({
            id: relId(a.id, b.id, 'author'),
            source: a.id,
            target: b.id,
            type: 'author',
            label: list(a.authors)[0],
          });
        }
      }

      if (enabledTypes.has('series')) {
        const sharedSeries = list(a.series).filter((s) => list(b.series).includes(s));
        if (sharedSeries.length > 0) {
          rels.push({
            id: relId(a.id, b.id, 'series'),
            source: a.id,
            target: b.id,
            type: 'series',
            label: sharedSeries[0],
          });
        }
      }

      if (enabledTypes.has('genre')) {
        const aSubjects = list(a.subjects);
        const bSubjectsLower = list(b.subjects).map((s) => s.toLowerCase());
        const sharedSubjects = aSubjects.filter((s) =>
          bSubjectsLower.includes(s.toLowerCase())
        );
        if (sharedSubjects.length >= 2) {
          rels.push({
            id: relId(a.id, b.id, 'genre'),
            source: a.id,
            target: b.id,
            type: 'genre',
            label: sharedSubjects.slice(0, 2).join(', '),
          });
        }
      }

      if (enabledTypes.has('category')) {
        const aCat = a.category?.trim();
        const bCat = b.category?.trim();
        if (aCat && bCat && aCat === bCat) {
          rels.push({
            id: relId(a.id, b.id, 'category'),
            source: a.id,
            target: b.id,
            type: 'category',
            label: aCat,
          });
        }
      }
    }
  }

  return rels;
}
