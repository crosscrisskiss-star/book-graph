import { useState } from 'react';
import type { Book, Relationship, RelationshipType } from '../types';
import { REL_LABELS } from '../types';
import { getBooksByAuthor, getBooksBySubject } from '../lib/openLibrary';
import { getBooksByAuthorNDL, getBooksBySubjectNDL, searchBooksNDL } from '../lib/ndl';
import { searchBooksGoogle } from '../lib/googleBooks';
import { booklogSearchUrl } from '../lib/booklogLink';
import { LibraryPanel } from './LibraryPanel';
import { getGeminiRecommendations, getGeminiSummary } from '../lib/gemini';

function amazonUrl(book: Book): string {
  const isbn = book.isbn?.replace(/[-\s]/g, '');
  const q = isbn ?? [book.title, book.authors?.[0]].filter(Boolean).join(' ');
  // No format filter: Amazonが全フォーマットを表示し、Kindle版があれば先頭に出る
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`;
}

const TEXT = {
  close: '\u00d7',
  year: '\u5e74',
  series: '\u30b7\u30ea\u30fc\u30ba',
  amazon: 'Amazon\u3067\u8cb7\u3046',
  booklog: '\u30d6\u30af\u30ed\u30b0\u3067\u898b\u308b',
  borrow: '\u56f3\u66f8\u9928\u3067\u501f\u308a\u308b',
  deleteBook: '\u3053\u306e\u672c\u3092\u524a\u9664',
  expandSection: '\u95a2\u4fc2\u6027\u3092\u5c55\u958b',
  existingRels: '\u65e2\u5b58\u306e\u95a2\u4fc2',
  manualSection: '\u624b\u52d5\u3067\u95a2\u4fc2\u3092\u8ffd\u52a0',
  manualTarget: '\u672c\u306e\u30bf\u30a4\u30c8\u30eb\uff08\u30b0\u30e9\u30d5\u5185\uff09',
  manualLabel: '\u30e9\u30d9\u30eb\uff08\u4efb\u610f\uff09',
  add: '\u8ffd\u52a0',
  adding: '\u53d6\u5f97\u4e2d...',
  notFound: '\u8a72\u5f53\u3059\u308b\u672c\u304c\u30b0\u30e9\u30d5\u5185\u306b\u898b\u3064\u304b\u308a\u307e\u305b\u3093',
  recommend2: '\u304a\u3059\u3059\u30812\u518a\u3092\u8ffd\u52a0',
  recommend2Adding: '\u53d6\u5f97\u4e2d...',
  recommend2Done: (n: number) => n > 0 ? `${n}\u518a\u8ffd\u52a0\u3057\u307e\u3057\u305f` : '\u65b0\u3057\u3044\u672c\u306f\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f',
};

const EXPAND_TYPES: Array<{ type: RelationshipType; label: string }> = [
  { type: 'author', label: '\u540c\u8457\u8005\u306e\u672c\u3092\u5c55\u958b' },
  { type: 'genre', label: '\u30b8\u30e3\u30f3\u30eb\u95a2\u9023\u3092\u5c55\u958b' },
  { type: 'recommendation', label: '\u304a\u3059\u3059\u3081\u3092\u5c55\u958b' },
  { type: 'category', label: '\u30ab\u30c6\u30b4\u30ea\u95a2\u9023\u3092\u5c55\u958b' },
];

interface Props {
  book: Book;
  relationships: Relationship[];
  allBooks: Book[];
  enabledTypes: Set<RelationshipType>;
  categories: string[];
  onAddBook: (book: Book) => void;
  onAddRelationship: (rel: Omit<Relationship, 'id'>) => void;
  onRemove: (id: string) => void;
  onToggleRead: (id: string) => void;
  onUpdateBook: (id: string, patch: Partial<Book>) => void;
  onAddCategory: (cat: string) => void;
  onClose: () => void;
}

function safeList(values: string[] | undefined): string[] {
  return Array.isArray(values) ? values : [];
}

export function BookSidebar({
  book,
  relationships,
  allBooks,
  enabledTypes,
  categories,
  onAddBook,
  onAddRelationship,
  onRemove,
  onToggleRead,
  onUpdateBook,
  onAddCategory,
  onClose,
}: Props) {
  const [expanding, setExpanding] = useState<RelationshipType | null>(null);
  const [addingRec, setAddingRec] = useState(false);
  const [recMessage, setRecMessage] = useState('');
  const [manualTarget, setManualTarget] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const [manualType, setManualType] = useState<RelationshipType>('recommendation');
  const [manualLabel, setManualLabel] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const authors = safeList(book.authors);
  const authorKeys = safeList(book.authorKeys);
  const subjects = safeList(book.subjects);
  const series = safeList(book.series);
  const myRels = relationships.filter(
    (rel) => rel.source === book.id || rel.target === book.id
  );

  async function expand(type: RelationshipType) {
    setExpanding(type);
    try {
      let candidates: Book[] = [];
      const isNDL = book.id.startsWith('ndl_');

      if (type === 'author' && authors.length > 0) {
        candidates = isNDL
          ? await getBooksByAuthorNDL(authors[0])
          : await getBooksByAuthor(authorKeys[0] ?? authors[0]);
      } else if (
        (type === 'genre' || type === 'category' || type === 'recommendation') &&
        subjects.length > 0
      ) {
        candidates = isNDL
          ? await getBooksBySubjectNDL(subjects[0])
          : await getBooksBySubject(subjects[0]);
      }

      const existingIds = new Set(allBooks.map((item) => item.id));
      for (const candidate of candidates) {
        if (!existingIds.has(candidate.id) && candidate.id !== book.id) {
          onAddBook(candidate);
        }
      }
    } finally {
      setExpanding(null);
    }
  }

  async function addRecommend2() {
    setAddingRec(true);
    setRecMessage('');
    try {
      const existingIds = new Set(allBooks.map((b) => b.id));

      const recs = await getGeminiRecommendations(
        book.title,
        authors[0] ?? '',
        subjects
      );

      if (recs.length === 0) {
        setRecMessage('Geminiからおすすめを取得できませんでした');
        return;
      }

      let added = 0;
      for (const rec of recs.slice(0, 2)) {
        const isNew = (b: Book) => !existingIds.has(b.id) && b.id !== book.id;
        const titleAuthor = [rec.title, rec.author].filter(Boolean).join(' ');

        // 1. NDL タイトル検索
        const ndlResults = await searchBooksNDL(rec.title);
        let found = ndlResults.find(isNew) ?? null;

        // 2. Google Books: タイトル + 著者名
        if (!found) {
          const googleResults = await searchBooksGoogle(titleAuthor, 8);
          found = googleResults.find(isNew) ?? null;
        }

        // 3. Google Books: タイトルのみ（著者名がなくても試す）
        if (!found && rec.author) {
          const googleResults = await searchBooksGoogle(rec.title, 5);
          found = googleResults.find(isNew) ?? null;
        }

        if (found) {
          onAddBook(found);
          onAddRelationship({ source: book.id, target: found.id, type: 'recommendation' });
          existingIds.add(found.id);
          added++;
        }
      }

      setRecMessage(
        added > 0
          ? TEXT.recommend2Done(added)
          : `おすすめ:「${recs.map((r) => r.title).join('」「')}」は見つかりませんでした`
      );
    } catch (e) {
      setRecMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setAddingRec(false);
    }
  }

  async function handleSummarize() {
    setSummarizing(true);
    setSummaryError('');
    try {
      const summary = await getGeminiSummary(
        book.title,
        authors[0] ?? '',
        subjects,
        book.description
      );
      onUpdateBook(book.id, { aiSummary: summary });
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setSummarizing(false);
    }
  }

  function confirmAddCategory() {
    const cat = categoryInput.trim();
    if (cat) {
      onAddCategory(cat);
      onUpdateBook(book.id, { category: cat });
    }
    setAddingCategory(false);
    setCategoryInput('');
  }

  function addManual() {
    const needle = manualTarget.trim().toLowerCase();
    const target = allBooks.find((item) => item.title.toLowerCase().includes(needle));
    if (!target || target.id === book.id) {
      window.alert(TEXT.notFound);
      return;
    }

    onAddRelationship({
      source: book.id,
      target: target.id,
      type: manualType,
      label: manualLabel.trim() || undefined,
    });
    setManualTarget('');
    setManualLabel('');
  }

  if (showLibrary) {
    return <LibraryPanel book={book} onClose={() => setShowLibrary(false)} />;
  }

  return (
    <aside className="sidebar">
      <button className="sidebar-close" onClick={onClose} aria-label="close">
        {TEXT.close}
      </button>

      {book.coverUrl && (
        <img src={book.coverUrl} alt="" className="sidebar-cover" />
      )}

      <div className="sidebar-title">{book.title}</div>
      <div className="sidebar-author">{authors.join(', ')}</div>
      {book.year && <div className="sidebar-year">{book.year}{TEXT.year}</div>}

      {series.length > 0 && (
        <div className="sidebar-meta">{TEXT.series}: {series.join(', ')}</div>
      )}

      <button
        className={`btn-read-toggle${book.read ? ' read' : ''}`}
        onClick={() => onToggleRead(book.id)}
      >
        {book.read ? '✓ 既読' : '○ 未読'}
      </button>
      <div className="sidebar-section-title">AI要約</div>
      {book.aiSummary ? (
        <div className="ai-summary-box">
          <p className="ai-summary-text">{book.aiSummary}</p>
          <button
            className="btn-ai-summary-regen"
            onClick={handleSummarize}
            disabled={summarizing}
          >
            {summarizing ? '生成中...' : '再生成'}
          </button>
        </div>
      ) : (
        <button
          className="btn-ai-summary"
          onClick={handleSummarize}
          disabled={summarizing}
        >
          {summarizing ? '生成中...' : 'Geminiで要約する'}
        </button>
      )}
      {summaryError && <div className="ai-summary-error">{summaryError}</div>}

      <div className="sidebar-section-title">評価・読書メモ</div>
      <div className="book-note-form">
        <label className="book-note-label">
          <span>カテゴリ</span>
          {addingCategory ? (
            <div className="category-add-row">
              <input
                className="book-category-input"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="カテゴリ名"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAddCategory();
                  if (e.key === 'Escape') setAddingCategory(false);
                }}
              />
              <button className="category-add-btn" onClick={confirmAddCategory}>追加</button>
              <button className="category-cancel-btn" onClick={() => setAddingCategory(false)}>×</button>
            </div>
          ) : (
            <select
              className="book-category-select"
              value={book.category ?? ''}
              onChange={(e) => {
                if (e.target.value === '__add__') {
                  setAddingCategory(true);
                } else {
                  onUpdateBook(book.id, { category: e.target.value || undefined });
                }
              }}
            >
              <option value="">なし</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__add__">＋ 新しいカテゴリ...</option>
            </select>
          )}
        </label>
        <label className="book-note-label">
          <span>評価</span>
          <select
            className="book-rating-select"
            value={book.rating ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onUpdateBook(book.id, { rating: value ? Number(value) : undefined });
            }}
          >
            <option value="">未評価</option>
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>{rating}</option>
            ))}
          </select>
        </label>
        <label className="book-note-label">
          <span>読書メモ</span>
          <textarea
            className="book-memo-input"
            value={book.privateMemo ?? ''}
            onChange={(event) => onUpdateBook(book.id, { privateMemo: event.target.value })}
            placeholder="非公開の読書メモ"
            rows={5}
          />
        </label>
      </div>

      <a className="btn-amazon" href={amazonUrl(book)} target="_blank" rel="noopener noreferrer">
        {TEXT.amazon}
      </a>
      <a className="btn-booklog" href={booklogSearchUrl(book)} target="_blank" rel="noopener noreferrer">
        {TEXT.booklog}
      </a>
      <button className="btn-library" onClick={() => setShowLibrary(true)}>
        {TEXT.borrow}
      </button>
      <button
        className="btn-recommend2"
        onClick={addRecommend2}
        disabled={addingRec || expanding !== null}
      >
        {addingRec ? TEXT.recommend2Adding : TEXT.recommend2}
      </button>
      {recMessage && <div className="rec-message">{recMessage}</div>}
      <button className="btn-danger" onClick={() => onRemove(book.id)}>
        {TEXT.deleteBook}
      </button>

      {subjects.length > 0 && (
        <div className="sidebar-subjects">
          {subjects.slice(0, 8).map((subject) => (
            <span key={subject} className="subject-tag">{subject}</span>
          ))}
        </div>
      )}

      <div className="sidebar-section-title">{TEXT.expandSection}</div>
      <div className="expand-buttons">
        {EXPAND_TYPES.filter((item) => enabledTypes.has(item.type)).map(({ type, label }) => (
          <button
            key={type}
            className="btn-expand"
            onClick={() => expand(type)}
            disabled={expanding !== null}
          >
            {expanding === type ? TEXT.adding : label}
          </button>
        ))}
      </div>

      {myRels.length > 0 && (
        <>
          <div className="sidebar-section-title">
            {TEXT.existingRels} ({myRels.length})
          </div>
          <div className="rel-list">
            {myRels.map((rel) => {
              const other = allBooks.find(
                (item) => item.id === (rel.source === book.id ? rel.target : rel.source)
              );
              return (
                <div key={rel.id} className="rel-item">
                  <span className="rel-type-badge">{REL_LABELS[rel.type]}</span>
                  <span className="rel-book">{other?.title ?? '?'}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="sidebar-section-title">{TEXT.manualSection}</div>
      <div className="manual-form">
        <input
          className="manual-input"
          placeholder={TEXT.manualTarget}
          value={manualTarget}
          onChange={(e) => setManualTarget(e.target.value)}
        />
        <select
          className="manual-select"
          value={manualType}
          onChange={(e) => setManualType(e.target.value as RelationshipType)}
        >
          {(Object.keys(REL_LABELS) as RelationshipType[]).map((type) => (
            <option key={type} value={type}>{REL_LABELS[type]}</option>
          ))}
        </select>
        <input
          className="manual-input"
          placeholder={TEXT.manualLabel}
          value={manualLabel}
          onChange={(e) => setManualLabel(e.target.value)}
        />
        <button className="btn-primary" onClick={addManual}>{TEXT.add}</button>
      </div>
    </aside>
  );
}
