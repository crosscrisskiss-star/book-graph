import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, DrawStroke, GraphData, Relationship, RelationshipType } from './types';
import { loadGraph, saveGraph } from './lib/storage';
import { dedupeRelationships, detectRelationships, detectAllRelationships } from './lib/relationships';
import { BookGraph } from './components/BookGraph';
import { BookSearch } from './components/BookSearch';
import { BookSidebar } from './components/BookSidebar';
import { RelationshipFilter } from './components/RelationshipFilter';
import { searchBooksGoogle } from './lib/googleBooks';
import { parseBooklogCSV } from './lib/booklog';
import {
  isSyncConfigured, cloudLoad, cloudSave,
  loadSyncCode, saveSyncCode, clearSyncCode, generateCode,
} from './lib/sync';
import { searchBooksNDL } from './lib/ndl';
import { getBooksByAuthorNDL, getBooksBySubjectNDL } from './lib/ndl';
import { getBooksByAuthor, getBooksBySubject } from './lib/openLibrary';
import type { BookSearchFilters } from './lib/bookSearchFilters';
import { matchesBookFilters } from './lib/bookSearchFilters';

const ALL_TYPES: RelationshipType[] = [
  'author',
  'series',
  'genre',
  'recommendation',
  'reference',
  'manual',
];

function hasBooklogTitleHeader(text: string): boolean {
  return text.includes('\u30bf\u30a4\u30c8\u30eb') || text.includes('繧ｿ繧､繝医Ν');
}

const TEXT = {
  addBook: '\u002b \u672c\u3092\u8ffd\u52a0',
  close: '\u9589\u3058\u308b',
  books: '\u518a',
  relationships: '\u95a2\u4fc2',
  empty: '\u300c\u002b \u672c\u3092\u8ffd\u52a0\u300d\u304b\u3089\u672c\u3092\u691c\u7d22\u3057\u3066\u30b0\u30e9\u30d5\u306b\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044',
  listTitle: '\u672c\u4e00\u89a7',
  listFilterTitle: '\u30bf\u30a4\u30c8\u30eb',
  listFilterAuthor: '\u8457\u8005\u540d',
  listFilterPublisher: '\u51fa\u7248\u793e',
  listFilterEmpty: '\u6761\u4ef6\u306b\u5408\u3046\u672c\u304c\u3042\u308a\u307e\u305b\u3093',
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
  filteredBooks: Book[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  categories: string[];
  filters: BookSearchFilters;
  onFilterChange: (key: Exclude<keyof BookSearchFilters, 'category'>, value: string) => void;
  onToggleCategory: (cat: string) => void;
}

function BookList({ books, filteredBooks, selectedId, onSelect, categories, filters, onFilterChange, onToggleCategory }: BookListProps) {
  if (books.length === 0) return null;

  const usedCategories = categories.filter((c) => books.some((b) => b.category === c));
  const usedRatings = [...new Set(books.map((b) => b.rating).filter((r): r is number => r !== undefined))].sort();
  const hasUnrated = books.some((b) => b.rating === undefined);
  const usedSubjects = [...new Set(books.flatMap((b) => b.subjects))].sort();

  return (
    <section className="book-list-panel">
      <div className="panel-title">{TEXT.listTitle}</div>
      <div className="book-list-filters">
        <input
          className="book-list-filter-input"
          value={filters.title}
          onChange={(event) => onFilterChange('title', event.target.value)}
          placeholder={TEXT.listFilterTitle}
        />
        <input
          className="book-list-filter-input"
          value={filters.author}
          onChange={(event) => onFilterChange('author', event.target.value)}
          placeholder={TEXT.listFilterAuthor}
        />
        <input
          className="book-list-filter-input"
          value={filters.publisher}
          onChange={(event) => onFilterChange('publisher', event.target.value)}
          placeholder={TEXT.listFilterPublisher}
        />
        {usedSubjects.length > 0 && (
          <select
            className="book-list-filter-select"
            value={filters.subject}
            onChange={(e) => onFilterChange('subject', e.target.value)}
          >
            <option value="">すべてのジャンル</option>
            {usedSubjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {usedCategories.length > 0 && (
          <div className="cat-filter-chips">
            {usedCategories.map((cat) => (
              <button
                key={cat}
                className={`cat-filter-chip${filters.category.includes(cat) ? ' active' : ''}`}
                onClick={() => onToggleCategory(cat)}
              >{cat}</button>
            ))}
          </div>
        )}
        {(usedRatings.length > 0 || hasUnrated) && (
          <select
            className="book-list-filter-select"
            value={filters.rating}
            onChange={(e) => onFilterChange('rating', e.target.value)}
          >
            <option value="">すべての評価</option>
            {usedRatings.map((r) => (
              <option key={r} value={String(r)}>{'★'.repeat(r)}</option>
            ))}
            {hasUnrated && <option value="0">未評価</option>}
          </select>
        )}
      </div>
      <div className="book-list">
        {filteredBooks.map((book) => (
          <div key={book.id} className={`book-list-item${book.id === selectedId ? ' selected' : ''}`}>
            <button
              className={`book-list-main${book.read ? ' read' : ''}`}
              onClick={() => onSelect(book.id)}
            >
              <span className="book-list-title">{book.title}</span>
              {book.authors?.[0] && (
                <span className="book-list-author">{book.authors[0]}</span>
              )}
              {book.publisher && (
                <span className="book-list-publisher">{book.publisher}</span>
              )}
            </button>
          </div>
        ))}
        {filteredBooks.length === 0 && (
          <div className="book-list-empty">{TEXT.listFilterEmpty}</div>
        )}
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
  const [sidebarBookId, setSidebarBookId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [addingRecId, setAddingRecId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [listFilters, setListFilters] = useState<BookSearchFilters>({
    title: '', author: '', publisher: '', category: [], rating: '', subject: '',
  });
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [layoutKey, setLayoutKey] = useState(0);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const [groupByAuthor, setGroupByAuthor] = useState(false);
  const [syncCode, setSyncCode] = useState<string | null>(loadSyncCode);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'loading' | 'error'>('idle');
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [syncInput, setSyncInput] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  function updateGraph(fn: (prev: GraphData) => GraphData) {
    setGraph((prev) => {
      const next = fn(prev);
      saveGraph(next);
      return next;
    });
  }

  // Cloud: load on mount / code change
  useEffect(() => {
    if (!syncCode || !isSyncConfigured()) return;
    setSyncStatus('loading');
    cloudLoad(syncCode).then((data) => {
      if (data) { setGraph(data); saveGraph(data); setLastSynced(new Date()); }
      setSyncStatus('idle');
    }).catch((e: unknown) => {
      console.error('[sync] load failed:', e);
      setSyncStatus('error');
    });
  }, [syncCode]);

  // Cloud: auto-save 3s after graph change
  useEffect(() => {
    if (!syncCode || !isSyncConfigured()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSyncStatus('saving');
      cloudSave(syncCode, graph)
        .then(() => { setLastSynced(new Date()); setSyncStatus('idle'); })
        .catch((e: unknown) => {
          console.error('[sync] save failed:', e);
          setSyncStatus('error');
        });
    }, 3000);
  }, [graph, syncCode]);

  function activateCode(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    saveSyncCode(trimmed);
    setSyncCode(trimmed);
    setSyncInput('');
    setShowSyncPanel(false);
  }

  function disconnectSync() {
    clearSyncCode();
    setSyncCode(null);
    setSyncStatus('idle');
    setLastSynced(null);
    setShowSyncPanel(false);
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
    // ブクログCSVはShift-JIS。UTF-8で読んでヘッダーがなければShift-JISで再試行
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buffer);
    if (!hasBooklogTitleHeader(text)) {
      text = new TextDecoder('shift-jis').decode(buffer);
    }
    if (!hasBooklogTitleHeader(text)) {
      setImportMessage('ブクログCSVの形式を認識できませんでした');
      return;
    }
    const books = parseBooklogCSV(text);
    if (books.length === 0) {
      setImportMessage('本が見つかりませんでした（データ行が空か形式が異なります）');
      return;
    }
    updateGraph((prev) => {
      const existingIds = new Set(prev.books.map((b) => b.id));
      let next = prev;
      let added = 0;
      let updated = 0;
      for (const book of books) {
        if (existingIds.has(book.id)) {
          next = {
            ...next,
            books: next.books.map((b) =>
              b.id !== book.id ? b : {
                ...b,
                rating: book.rating,
                read: book.read,
                category: book.category,
                privateMemo: book.privateMemo,
                subjects: book.subjects.length > 0 ? book.subjects : b.subjects,
              }
            ),
          };
          updated++;
          continue;
        }
        const newRels = detectRelationships(next.books, book, enabledTypes);
        next = {
          books: [...next.books, book],
          relationships: dedupeRelationships([...next.relationships, ...newRels]),
        };
        existingIds.add(book.id);
        added++;
      }
      // Sync categories from imported books into the categories list
      const importedCategories = [...new Set(books.map((b) => b.category).filter((c): c is string => Boolean(c)))];
      const existingCategories = next.categories ?? [];
      const newCategories = importedCategories.filter((c) => !existingCategories.includes(c));
      if (newCategories.length > 0) {
        next = { ...next, categories: [...existingCategories, ...newCategories] };
      }

      const parts = [];
      if (added > 0) parts.push(`${added}冊追加`);
      if (updated > 0) parts.push(`${updated}冊更新`);
      setImportMessage(parts.length > 0 ? `${parts.join('・')}しました` : '変更はありませんでした');
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

  function updateBook(id: string, patch: Partial<Book>) {
    updateGraph((prev) => ({
      ...prev,
      books: prev.books.map((book) =>
        book.id === id ? { ...book, ...patch } : book
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
    if (sidebarBookId === id) setSidebarBookId(null);
  }

  function addTextLabel(id: string, text: string, kind: 'text' | 'frame', w?: number, h?: number) {
    updateGraph((prev) => ({
      ...prev,
      textLabels: [...(prev.textLabels ?? []), { id, text, kind, w, h }],
    }));
  }

  function updateTextLabel(id: string, text: string) {
    updateGraph((prev) => ({
      ...prev,
      textLabels: (prev.textLabels ?? []).map((l) => l.id === id ? { ...l, text } : l),
    }));
  }

  function removeTextLabel(id: string) {
    updateGraph((prev) => ({
      ...prev,
      textLabels: (prev.textLabels ?? []).filter((l) => l.id !== id),
    }));
  }

  function addDrawStroke(stroke: DrawStroke) {
    updateGraph((prev) => ({
      ...prev,
      drawStrokes: [...(prev.drawStrokes ?? []), stroke],
      drawVersion: 2,
    }));
  }

  function undoDrawStroke() {
    updateGraph((prev) => ({
      ...prev,
      drawStrokes: (prev.drawStrokes ?? []).slice(0, -1),
      drawVersion: 2,
    }));
  }

  function clearDrawStrokes() {
    updateGraph((prev) => ({ ...prev, drawStrokes: [], drawVersion: 2 }));
  }

  function setDrawStrokes(strokes: DrawStroke[]) {
    updateGraph((prev) => ({ ...prev, drawStrokes: strokes, drawVersion: 2 }));
  }

  function addCategory(cat: string) {
    updateGraph((prev) => {
      const existing = prev.categories ?? [];
      if (existing.includes(cat)) return prev;
      return { ...prev, categories: [...existing, cat] };
    });
  }

  function removeAllBooks() {
    if (!window.confirm(`全 ${graph.books.length} 冊を削除しますか？`)) return;
    updateGraph(() => ({ books: [], relationships: [] }));
    setSelectedId(null);
    setSidebarBookId(null);
  }

  function autoDetectRelationships() {
    const newRels = detectAllRelationships(graph.books, enabledTypes);
    const existingIds = new Set(graph.relationships.map((r) => r.id));
    const added = newRels.filter((r) => !existingIds.has(r.id));
    if (added.length === 0) {
      setImportMessage('新しい関係は見つかりませんでした');
    } else {
      updateGraph((prev) => ({
        ...prev,
        relationships: dedupeRelationships([...prev.relationships, ...added]),
      }));
      setImportMessage(`${added.length} 件の関係を追加しました`);
    }
    setTimeout(() => setImportMessage(''), 3000);
  }

  function toggleType(type: RelationshipType) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function selectBookFromList(id: string) {
    setSelectedId(id);
    setSidebarBookId(null);
    setFocusRequest(`${id}::${Date.now()}`);
  }

  function selectBookFromGraph(id: string) {
    setSelectedId(id);
    setSidebarBookId(id);
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

  const selectedBook = graph.books.find((book) => book.id === sidebarBookId) ?? null;
  const filteredBooks = useMemo(
    () => graph.books.filter((book) => matchesBookFilters(book, listFilters)),
    [graph.books, listFilters]
  );

  function updateListFilter(key: Exclude<keyof BookSearchFilters, 'category'>, value: string) {
    setListFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategoryFilter(cat: string) {
    setListFilters((prev) => ({
      ...prev,
      category: prev.category.includes(cat)
        ? prev.category.filter((c) => c !== cat)
        : [...prev.category, cat],
    }));
  }
  const existingIds = new Set(graph.books.map((book) => book.id));

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">Book Graph</span>
        <button className="btn-primary" onClick={() => setShowSearch((value) => !value)}>
          {showSearch ? TEXT.close : TEXT.addBook}
        </button>
        {graph.books.length > 0 && (
          <button className="btn-relayout" onClick={() => setLayoutKey((k) => k + 1)}>
            再配置
          </button>
        )}
        {graph.books.length > 0 && (
          <button
            className={`btn-group-author${groupByAuthor ? ' active' : ''}`}
            onClick={() => setGroupByAuthor((v) => !v)}
          >
            著者でまとめる
          </button>
        )}
        {graph.books.length > 1 && (
          <button className="btn-auto-detect" onClick={autoDetectRelationships}>
            関係を自動検出
          </button>
        )}
        {graph.books.length > 0 && (
          <button className="btn-clear-all" onClick={removeAllBooks}>
            全削除
          </button>
        )}
        {isSyncConfigured() && (
          <button
            className={`btn-sync ${syncStatus}`}
            onClick={() => setShowSyncPanel((v) => !v)}
            title={syncCode ? `同期コード: ${syncCode}` : 'クラウド同期'}
          >
            {syncStatus === 'saving' ? '↑' : syncStatus === 'loading' ? '↓' : '☁'}
            {syncCode ? ` ${syncCode.slice(0, 4)}-${syncCode.slice(4)}` : ' 同期'}
          </button>
        )}
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
          <BookSearch onAdd={(book) => {
            addBook(book);
            setShowSearch(false);
            setListFilters({ title: '', author: '', publisher: '', category: [], rating: '', subject: '' });
            setSelectedId(book.id);
            setSidebarBookId(book.id);
            setFocusRequest(`${book.id}::${Date.now()}`);
          }} existingIds={existingIds} />
        </div>
      )}

      {showSyncPanel && isSyncConfigured() && (
        <div className="sync-overlay">
          <div className="sync-panel">
            <div className="sync-panel-title">☁ クラウド同期</div>
            {syncCode ? (
              <>
                <div className="sync-code-display">
                  <span className="sync-code-value">{syncCode.slice(0, 4)}-{syncCode.slice(4)}</span>
                  <button
                    className="sync-copy-btn"
                    onClick={() => navigator.clipboard.writeText(syncCode)}
                  >コピー</button>
                </div>
                <p className="sync-hint">他の端末でこのコードを入力すると同期されます</p>
                {lastSynced && (
                  <p className="sync-last">最終同期: {lastSynced.toLocaleTimeString()}</p>
                )}
                <button
                  className="sync-pull-btn"
                  disabled={syncStatus === 'loading'}
                  onClick={() => {
                    setSyncStatus('loading');
                    cloudLoad(syncCode!).then((data) => {
                      if (data) { setGraph(data); saveGraph(data); setLastSynced(new Date()); }
                      setSyncStatus('idle');
                    }).catch((e: unknown) => { console.error('[sync] manual load:', e); setSyncStatus('error'); });
                  }}
                >↓ 今すぐ取得</button>
                {syncStatus === 'error' && (
                  <p className="sync-error">⚠ 同期に失敗しました。ブラウザの開発者コンソール（F12）でエラー詳細を確認してください。</p>
                )}
                <button className="sync-disconnect-btn" onClick={disconnectSync}>
                  同期を解除
                </button>
              </>
            ) : (
              <>
                <p className="sync-hint">新しいコードを作るか、既存のコードを入力してください</p>
                <button
                  className="sync-new-btn"
                  onClick={() => activateCode(generateCode())}
                >新しいコードを作成</button>
                <div className="sync-input-row">
                  <input
                    className="sync-input"
                    placeholder="コードを入力 (例: ABCD1234)"
                    value={syncInput}
                    onChange={(e) => setSyncInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && activateCode(syncInput)}
                  />
                  <button
                    className="sync-connect-btn"
                    onClick={() => activateCode(syncInput)}
                  >接続</button>
                </div>
              </>
            )}
          </div>
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
                filteredBooks={filteredBooks}
                selectedId={selectedId}
                onSelect={selectBookFromList}
                categories={graph.categories ?? []}
                filters={listFilters}
                onFilterChange={updateListFilter}
                onToggleCategory={toggleCategoryFilter}
              />
            </>
          )}
        </aside>

        <div className="graph-container">
          {graph.books.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">Book</div>
              <div className="empty-text">{TEXT.empty}</div>
            </div>
          ) : (
            <BookGraph
              data={{ books: filteredBooks, relationships: graph.relationships }}
              enabledTypes={enabledTypes}
              selectedId={selectedId}
              onSelectBook={selectBookFromGraph}
              layoutKey={layoutKey}
              focusRequest={focusRequest}
              groupByAuthor={groupByAuthor}
              textLabels={graph.textLabels ?? []}
              onAddTextLabel={addTextLabel}
              onUpdateTextLabel={updateTextLabel}
              onDeleteTextLabel={removeTextLabel}
              drawStrokes={graph.drawStrokes ?? []}
              onAddDrawStroke={addDrawStroke}
              onUndoDrawStroke={undoDrawStroke}
              onClearDrawStrokes={clearDrawStrokes}
              onSetDrawStrokes={setDrawStrokes}
              categories={graph.categories ?? []}
              onBulkUpdateBooks={(ids, patch) => {
                updateGraph((prev) => ({
                  ...prev,
                  books: prev.books.map((b) => ids.includes(b.id) ? { ...b, ...patch } : b),
                }));
              }}
            />
          )}

        </div>

        {selectedBook && (
          <BookSidebar
            book={selectedBook}
            relationships={graph.relationships}
            allBooks={graph.books}
            enabledTypes={enabledTypes}
            categories={graph.categories ?? []}
            onAddBook={addBook}
            onAddRelationship={addRelationship}
            onRemove={removeBook}
            onToggleRead={toggleRead}
            onUpdateBook={updateBook}
            onAddCategory={addCategory}
            onClose={() => setSidebarBookId(null)}
          />
        )}
      </div>
    </div>
  );
}
