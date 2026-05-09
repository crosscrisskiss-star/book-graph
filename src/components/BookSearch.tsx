import { useState } from 'react';
import type { Book } from '../types';
import { searchBooksGoogle } from '../lib/googleBooks';
import { searchBooksNDL } from '../lib/ndl';
import { searchBooks } from '../lib/openLibrary';

const JP_RE = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/;

const TEXT = {
  placeholder: '\u672c\u3092\u691c\u7d22\uff08\u30bf\u30a4\u30c8\u30eb\u30fb\u8457\u8005\uff09',
  search: '\u691c\u7d22',
  noResults: '\u691c\u7d22\u7d50\u679c\u304c\u3042\u308a\u307e\u305b\u3093\u3067\u3057\u305f',
  failed: '\u691c\u7d22\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u30cd\u30c3\u30c8\u30ef\u30fc\u30af\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
  year: '\u5e74',
  added: '\u8ffd\u52a0\u6e08',
  add: '\u8ffd\u52a0',
};

interface Props {
  onAdd: (book: Book) => void;
  existingIds: Set<string>;
}

async function searchJapaneseBooks(query: string): Promise<Book[]> {
  const [googleBooks, ndlBooks] = await Promise.all([
    searchBooksGoogle(query, 20),
    searchBooksNDL(query),
  ]);

  const seen = new Set<string>();
  return [...googleBooks, ...ndlBooks].filter((book) => {
    const key = `${book.title.trim().toLowerCase()}::${book.authors[0] ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function BookSearch({ onAdd, existingIds }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const books = JP_RE.test(trimmed)
        ? await searchJapaneseBooks(trimmed)
        : await searchBooks(trimmed);

      if (books.length === 0) {
        setError(TEXT.noResults);
      } else {
        setResults(books);
      }
    } catch (err) {
      console.error('[BookSearch] search failed:', err);
      setError(TEXT.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="search-panel">
      <form onSubmit={handleSearch} className="search-form">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={TEXT.placeholder}
          autoFocus
        />
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? '...' : TEXT.search}
        </button>
      </form>

      {error && <div className="search-error">{error}</div>}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((book) => {
            const added = existingIds.has(book.id);
            return (
              <div key={book.id} className="search-result-item">
                {book.coverUrl && (
                  <img src={book.coverUrl} alt="" className="result-cover" />
                )}
                <div className="result-info">
                  <div className="result-title">{book.title}</div>
                  <div className="result-author">{book.authors.join(', ')}</div>
                  {book.year && <div className="result-year">{book.year}{TEXT.year}</div>}
                </div>
                <button
                  className={added ? 'btn-added' : 'btn-add'}
                  onClick={() => !added && onAdd(book)}
                  disabled={added}
                >
                  {added ? TEXT.added : TEXT.add}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
