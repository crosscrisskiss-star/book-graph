import { useState, useCallback } from 'react';
import type { Book } from '../types';
import {
  PREFS, getLibraries, checkAvailability,
  loadAppKey, saveAppKey, loadPref, savePref,
  type BookAvailability,
} from '../lib/calil';

interface Props {
  book: Book;
  onClose: () => void;
}

type LibStatus = string;

const STATUS_COLOR: Record<LibStatus, string> = {
  '貸出可': '#22c55e',
  '蔵書あり': '#86efac',
  '館内のみ': '#facc15',
  '貸出中': '#f87171',
  '予約中': '#fb923c',
  '準備中': '#94a3b8',
  '休館中': '#64748b',
  '蔵書なし': '#334155',
};

export function LibraryPanel({ book, onClose }: Props) {
  const [appkey, setAppkey] = useState(loadAppKey);
  const [pref, setPref] = useState(loadPref);
  const [results, setResults] = useState<BookAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const isbn = book.isbn;

  const handleSearch = useCallback(async () => {
    if (!appkey.trim()) { setError('APIキーを入力してください'); return; }
    if (!isbn) { setError('この本にはISBNがないため検索できません'); return; }

    saveAppKey(appkey.trim());
    savePref(pref);
    setError('');
    setLoading(true);
    setResults([]);
    setSearched(true);

    try {
      const libs = await getLibraries(appkey.trim(), pref);
      if (libs.length === 0) {
        setError('図書館が見つかりませんでした');
        return;
      }
      await checkAvailability(appkey.trim(), isbn, libs, (r) => {
        setResults([...r]);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '検索に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [appkey, isbn, pref]);

  const hasResult = results.some((r) => Object.keys(r.libkey).length > 0);

  return (
    <div className="library-panel">
      <div className="library-panel-header">
        <span className="library-panel-title">図書館で借りる</span>
        <button className="sidebar-close" onClick={onClose}>×</button>
      </div>

      <div className="library-book-title">{book.title}</div>
      {isbn
        ? <div className="library-isbn">ISBN: {isbn}</div>
        : <div className="library-no-isbn">ISBNなし（図書館検索不可）</div>
      }

      <div className="library-form">
        <label className="library-label">都道府県</label>
        <select
          className="manual-select"
          value={pref}
          onChange={(e) => setPref(e.target.value)}
        >
          {PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <label className="library-label">
          カーリル APIキー
          <a
            href="https://calil.jp/doc/api.html"
            target="_blank"
            rel="noreferrer"
            className="library-key-link"
          >取得</a>
        </label>
        <input
          className="manual-input"
          type="text"
          value={appkey}
          onChange={(e) => setAppkey(e.target.value)}
          placeholder="appkey を入力"
        />

        <button
          className="btn-primary"
          onClick={handleSearch}
          disabled={loading || !isbn}
        >
          {loading ? '検索中...' : '図書館を検索'}
        </button>
      </div>

      {error && <div className="library-error">{error}</div>}

      {searched && !loading && !error && !hasResult && (
        <div className="library-empty">蔵書が確認できた図書館はありませんでした</div>
      )}

      {results.length > 0 && (
        <div className="library-results">
          {results
            .filter((r) => Object.keys(r.libkey).length > 0)
            .map((r) => (
              <div key={r.systemid} className="library-system">
                <div className="library-system-name">{r.systemname}</div>
                {Object.entries(r.libkey).map(([libname, status]) => (
                  <div key={libname} className="library-lib-row">
                    <span
                      className="library-status-dot"
                      style={{ background: STATUS_COLOR[status] ?? '#64748b' }}
                    />
                    <span className="library-lib-name">{libname}</span>
                    <span
                      className="library-status-label"
                      style={{ color: STATUS_COLOR[status] ?? '#94a3b8' }}
                    >
                      {status}
                    </span>
                  </div>
                ))}
                {r.reserveurl && (
                  <a
                    href={r.reserveurl}
                    target="_blank"
                    rel="noreferrer"
                    className="library-reserve-link"
                  >
                    予約する →
                  </a>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
