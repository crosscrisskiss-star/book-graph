import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, GraphData, Relationship, RelationshipType } from './types';
import { loadGraph, saveGraph } from './lib/storage';
import { dedupeRelationships, detectRelationships } from './lib/relationships';
import { BookGraph } from './components/BookGraph';
import { BookSearch } from './components/BookSearch';
import { BookSidebar } from './components/BookSidebar';
import { RelationshipFilter } from './components/RelationshipFilter';
import { searchBooksGoogle } from './lib/googleBooks';
import { parseBooklogCSV } from './lib/booklog';
import { searchBooksNDL } from './lib/ndl';
import { getBooksByAuthorNDL, getBooksBySubjectNDL } from './lib/ndl';
import { getBooksByAuthor, getBooksBySubject } from './lib/openLibrary';

const ALL_TYPES: RelationshipType[] = [
  'author',
  'series',
  'genre',
  'recommendation',
  'reference',
  'theme',
  'manual',
];

const TEXT = {
  addBook: '\u002b \u672c\u3092\u8ffd\u52a0',
  close: '\u9589\u3058\u308b',
  books: '\u518a',
  relationships: '\u95a2\u4fc2',
  empty: '\u300c\u002b \u672c\u3092\u8ffd\u52a0\u300d\u304b\u3089\u672c\u3092\u691c\u7d22\u3057\u3066\u30b0\u30e9\u30d5\u306b\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044',
  listTitle: '\u672c\u4e00\u89a7',
  select: '\u9078\u629e',
  deleteBook: '\u524a\u9664',
  recommend2: '\u304a\u3059\u3059\u30812\u518a',
  recommend2Adding: '...',
};

function relId(source: string, target: string, type: RelationshipType): string {
  return `${[source, target].sort().join('--')}::${type}`;
}

interface BookListProps {
  books: Book[];
  selectedId: string | null;
  addingRecId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRecommend2: (book: Book) => void;
}

function BookList({ books, selectedId, addingRecId, onSelect, onRemove, onRecommend2 }: BookListProps) {
  if (books.length === 0) return null;

  return (
    <section className="book-list-panel">
      <div className="panel-title">{TEXT.listTitle}</div>
      <div className="book-list">
        {books.map((book) => (
          <div
            key={book.id}
            className={`book-list-item${book.id === selectedId ? ' selected' : ''}`}
          >
            <button
              className={`book-list-main${book.read ? ' read' : ''}`}
              onClick={() => onSelect(book.id)}
            >
              <span className="book-list-title">{book.title}</span>
              {book.authors?.[0] && (
                <span className="book-list-author">{book.authors[0]}</span>
              )}
            </button>
            <button
              className="book-list-rec2"
              title={TEXT.recommend2}
              disabled={addingRecId === book.id}
              onClick={() => onRecommend2(book)}
            >
              {addingRecId === book.id ? TEXT.recommend2Adding : TEXT.recommend2}
            </button>
            <button
              className="book-list-delete"
              title={TEXT.deleteBook}
              onClick={() => onRemove(book.id)}
            >
              {TEXT.deleteBook}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [graph, setGraph] = useState<GraphData>(loadGraph);
  const [enabledTypes, setEnabledTypes] = useState<Set<RelationshipType>>(
    new Set(ALL_TYPES)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [addingRecId, setAddingRecId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [nodeMenu, setNodeMenu] = useState<{ bookId: string; x: number; y: number } | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const csvInputRef = useRef<HTMLInputElement>(null);

  function updateGraph(fn: (prev: GraphData) => GraphData) {
    setGraph((prev) => {
      const next = fn(prev);
      saveGraph(next);
      return next;
    });
  }

  const addBook = useCallback(
    (book: Book) => {
      updateGraph((prev) => {
        if (prev.books.find((item) => item.id === book.id)) return prev;
        const newRels = detectRelationships(prev.books, book, enabledTypes);
        return {
          books: [...prev.books, book],
          relationships: dedupeRelationships([...prev.relationships, ...newRels]),
        };
      });
    },
    [enabledTypes]
  );

  function addRelationship(rel: Omit<Relationship, 'id'>) {
    updateGraph((prev) => {
      const id = relId(rel.source, rel.target, rel.type);
      if (prev.relationships.find((item) => item.id === id)) return prev;
      return {
        ...prev,
        relationships: [...prev.relationships, { ...rel, id }],
      };
    });
  }

  async function addRecommend2(book: Book) {
    if (addingRecId) return;
    setAddingRecId(book.id);
    try {
      const isNDL = book.id.startsWith('ndl_');
      const existingIds = new Set(graph.books.map((b) => b.id));
      let candidates: Book[] = [];

      if (book.authors?.length > 0) {
        const byAuthor = isNDL
          ? await getBooksByAuthorNDL(book.authors[0])
          : await getBooksByAuthor(book.authorKeys?.[0] ?? book.authors[0]);
        candidates.push(...byAuthor);
      }
      if (candidates.filter((c) => !existingIds.has(c.id) && c.id !== book.id).length < 2 && book.subjects?.length > 0) {
        const bySubject = isNDL
          ? await getBooksBySubjectNDL(book.subjects[0])
          : await getBooksBySubject(book.subjects[0]);
        candidates.push(...bySubject);
      }

      const picks: Book[] = [];
      const seen = new Set<string>();
      for (const c of candidates) {
        if (picks.length >= 2) break;
        if (existingIds.has(c.id) || c.id === book.id || seen.has(c.id)) continue;
        seen.add(c.id);
        picks.push(c);
      }
      for (const picked of picks) {
        addBook(picked);
        addRelationship({ source: book.id, target: picked.id, type: 'recommendation' });
      }
    } finally {
      setAddingRecId(null);
    }
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const books = parseBooklogCSV(text);
    if (books.length === 0) {
      setImportMessage('本が見つかりませんでした');
      return;
    }
    updateGraph((prev) => {
      const existingIds = new Set(prev.books.map((b) => b.id));
      let next = prev;
      let added = 0;
      for (const book of books) {
        if (existingIds.has(book.id)) continue;
        const newRels = detectRelationships(next.books, book, enabledTypes);
        next = {
          books: [...next.books, book],
          relationships: dedupeRelationships([...next.relationships, ...newRels]),
        };
        existingIds.add(book.id);
        added++;
      }
      setImportMessage(`${added}冊追加しました`);
      return next;
    });
    setTimeout(() => setImportMessage(''), 3000);
  }

  function toggleRead(id: string) {
    updateGraph((prev) => ({
      ...prev,
      books: prev.books.map((book) =>
        book.id === id ? { ...book, read: !book.read } : book
      ),
    }));
  }

  function removeBook(id: string) {
    updateGraph((prev) => ({
      books: prev.books.filter((book) => book.id !== id),
      relationships: prev.relationships.filter(
        (rel) => rel.source !== id && rel.target !== id
      ),
    }));
    if (selectedId === id) setSelectedId(null);
  }

  function toggleType(type: RelationshipType) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  useEffect(() => {
    const targets = graph.books.filter((book) => !book.coverUrl).slice(0, 5);
    if (targets.length === 0) return;

    let cancelled = false;

    async function enrichCovers() {
      const patches = new Map<string, Pick<Book, 'coverUrl' | 'isbn'>>();

      for (const book of targets) {
        const duplicateWithCover = graph.books.find(
          (candidate) =>
            candidate.id !== book.id &&
            candidate.title === book.title &&
            Boolean(candidate.coverUrl)
        );

        if (duplicateWithCover?.coverUrl) {
          patches.set(book.id, {
            coverUrl: duplicateWithCover.coverUrl,
            isbn: book.isbn ?? duplicateWithCover.isbn,
          });
          continue;
        }

        const ndlCandidates = await searchBooksNDL(book.title);
        const ndlMatched =
          ndlCandidates.find((candidate) => candidate.title === book.title && candidate.coverUrl) ??
          ndlCandidates.find((candidate) => candidate.coverUrl);

        if (ndlMatched?.coverUrl) {
          patches.set(book.id, {
            coverUrl: ndlMatched.coverUrl,
            isbn: book.isbn ?? ndlMatched.isbn,
          });
          continue;
        }

        const googleCandidates = await searchBooksGoogle(book.title, 5);
        const googleMatched =
          googleCandidates.find((candidate) => candidate.title === book.title && candidate.coverUrl) ??
          googleCandidates.find((candidate) => candidate.coverUrl);

        if (googleMatched?.coverUrl) {
          patches.set(book.id, { coverUrl: googleMatched.coverUrl, isbn: book.isbn });
        }
      }

      if (cancelled || patches.size === 0) return;

      setGraph((prev) => {
        const next = {
          ...prev,
          books: prev.books.map((book) =>
            patches.has(book.id) ? { ...book, ...patches.get(book.id) } : book
          ),
        };
        saveGraph(next);
        return next;
      });
    }

    void enrichCovers();

    return () => {
      cancelled = true;
    };
  }, [graph.books]);

  const menuBook = nodeMenu ? (graph.books.find((b) => b.id === nodeMenu.bookId) ?? null) : null;
  const selectedBook = graph.books.find((book) => book.id === selectedId) ?? null;
  const existingIds = new Set(graph.books.map((book) => book.id));

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">Book Graph</span>
        <button className="btn-primary" onClick={() => setShowSearch((value) => !value)}>
          {showSearch ? TEXT.close : TEXT.addBook}
        </button>
        <button className="btn-csv" onClick={() => csvInputRef.current?.click()}>
          ブクログCSV
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleCSVImport}
        />
        {importMessage && <span className="import-message">{importMessage}</span>}
        {graph.books.length > 0 && (
          <span className="header-count">
            {graph.books.length}{TEXT.books} / {graph.relationships.length}{TEXT.relationships}
          </span>
        )}
      </header>

      {showSearch && (
        <div className="search-overlay">
          <BookSearch onAdd={(book) => { addBook(book); setShowSearch(false); }} existingIds={existingIds} />
        </div>
      )}

      <div className="main">
        <aside className={`left-panel${showLeftPanel ? '' : ' collapsed'}`}>
          <button
            className="left-panel-toggle"
            onClick={() => setShowLeftPanel((v) => !v)}
            title={showLeftPanel ? 'パネルを隠す' : 'パネルを表示'}
          >
            {showLeftPanel ? '◀' : '▶'}
          </button>
          {showLeftPanel && (
            <>
              <RelationshipFilter enabled={enabledTypes} onChange={toggleType} />
              <BookList
                books={graph.books}
                selectedId={selectedId}
                addingRecId={addingRecId}
                onSelect={setSelectedId}
                onRemove={removeBook}
                onRecommend2={addRecommend2}
              />
            </>
          )}
        </aside>

        <div className="graph-container" onClick={() => setNodeMenu(null)}>
          {graph.books.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">Book</div>
              <div className="empty-text">{TEXT.empty}</div>
            </div>
          ) : (
            <BookGraph
              data={graph}
              enabledTypes={enabledTypes}
              selectedId={selectedId}
              onSelectBook={setSelectedId}
              onNodeMenu={(id, x, y) => setNodeMenu({ bookId: id, x, y })}
            />
          )}
          {nodeMenu && menuBook && (
            <div
              className="node-menu"
              style={{ left: nodeMenu.x + 44, top: nodeMenu.y - 44 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="node-menu-item"
                disabled={addingRecId === menuBook.id}
                onClick={() => { addRecommend2(menuBook); setNodeMenu(null); }}
              >
                {addingRecId === menuBook.id ? '取得中...' : 'おすすめ2冊'}
              </button>
              <button
                className={`node-menu-item${menuBook.read ? ' read' : ''}`}
                onClick={() => { toggleRead(menuBook.id); setNodeMenu(null); }}
              >
                {menuBook.read ? '✓ 既読' : '○ 未読'}
              </button>
              <button
                className="node-menu-item danger"
                onClick={() => { removeBook(menuBook.id); setNodeMenu(null); }}
              >
                削除
              </button>
            </div>
          )}
        </div>

        {selectedBook && (
          <BookSidebar
            book={selectedBook}
            relationships={graph.relationships}
            allBooks={graph.books}
            enabledTypes={enabledTypes}
            onAddBook={addBook}
            onAddRelationship={addRelationship}
            onRemove={removeBook}
            onToggleRead={toggleRead}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
