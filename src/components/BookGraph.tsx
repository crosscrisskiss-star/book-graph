import { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Book, GraphData, RelationshipType } from '../types';
import { REL_COLORS } from '../types';
import { loadPositions, savePositions, type PositionMap } from '../lib/positions';
import { loadFavorites, saveFavorite, deleteFavorite, type FavoriteLayout } from '../lib/favorites';

interface Props {
  data: GraphData;
  enabledTypes: Set<RelationshipType>;
  selectedId: string | null;
  onSelectBook: (id: string) => void;
  layoutKey: number;
  focusRequest: string | null;
  groupByAuthor: boolean;
}

const BOOK_NODE_SELECTOR = '.book-node';

function coverForBook(book: Book): string {
  if (book.coverUrl?.startsWith('https://cover.openbd.jp/')) {
    return book.coverUrl.replace('https://cover.openbd.jp', '/api/openbd-cover');
  }
  if (book.coverUrl?.startsWith('https://books.google.com')) {
    return book.coverUrl.replace('https://books.google.com', '/api/google-cover');
  }
  if (book.coverUrl?.startsWith('https://thumbnail-s.images.books.or.jp/')) {
    return book.coverUrl.replace('https://thumbnail-s.images.books.or.jp', '/api/books-cover');
  }
  if (book.coverUrl?.startsWith('https://covers.openlibrary.org/')) {
    return book.coverUrl.replace('https://covers.openlibrary.org', '/api/ol-cover');
  }
  if (book.coverUrl?.startsWith('https://ndlsearch.ndl.go.jp/thumbnail/')) {
    return book.coverUrl.replace('https://ndlsearch.ndl.go.jp/thumbnail', '/api/ndl-thumbnail');
  }
  if (book.coverUrl) return book.coverUrl;

  const isbn = book.isbn?.replace(/[-\s]/g, '');
  return isbn ? `/api/books-cover/${isbn}.jpg` : generatedCoverForBook(book);
}

function generatedCoverForBook(book: Book): string {
  const lines: string[] = [];
  for (let i = 0; i < book.title.length && lines.length < 4; i += 6) {
    const chunk = book.title.slice(i, i + 6);
    lines.push(i + 6 < book.title.length && lines.length === 3 ? `${chunk.slice(0, 5)}...` : chunk);
  }

  const author = book.authors?.[0] ?? '';
  const textEls = lines
    .map((line, index) => {
      const y = 32 + index * 15;
      return `<text x="34" y="${y}" fill="#f8fafc" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(line)}</text>`;
    })
    .join('');

  const authorText = author
    ? `<text x="34" y="82" fill="#bfdbfe" font-family="sans-serif" font-size="8" text-anchor="middle">${escapeXml(author.slice(0, 14))}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="96" viewBox="0 0 68 96">
    <rect width="68" height="96" rx="5" fill="#1e3a5f"/>
    <rect x="3" y="3" width="62" height="90" rx="4" fill="none" stroke="#60a5fa" stroke-width="1.5" opacity=".65"/>
    ${textEls}
    ${authorText}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nodeLabel(book: Book): string {
  const title = book.title.length > 15 ? `${book.title.slice(0, 14)}...` : book.title;
  const author = book.authors?.[0]
    ? book.authors[0].length > 12 ? `${book.authors[0].slice(0, 11)}...` : book.authors[0]
    : '';
  return author ? `${title}\n${author}` : title;
}

function visibleGraphNodes(cy: cytoscape.Core): cytoscape.CollectionReturnValue {
  return cy.nodes().filter((node) => node.hasClass('book-node'));
}

function fitVisible(cy: cytoscape.Core) {
  cy.resize();
  const nodes = visibleGraphNodes(cy);
  if (nodes.length > 0) cy.fit(nodes, 48);
}

function saveCurrentPositions(cy: cytoscape.Core) {
  const positions: PositionMap = loadPositions();
  cy.nodes(BOOK_NODE_SELECTOR).forEach((node) => {
    positions[node.id()] = { ...node.position() };
  });
  savePositions(positions);
}

function restoreSavedPositions(cy: cytoscape.Core, books: Book[], saved: PositionMap): boolean {
  let restored = false;
  cy.batch(() => {
    for (const book of books) {
      const position = saved[book.id];
      if (!position) continue;
      const node = cy.getElementById(book.id);
      if (!node.length) continue;
      node.position(position);
      restored = true;
    }
  });
  return restored;
}

function applyGridLayout(cy: cytoscape.Core) {
  const nodes = cy.nodes(BOOK_NODE_SELECTOR);
  if (nodes.length === 0) return;

  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const gapX = 170;
  const gapY = 220;

  cy.batch(() => {
    nodes.forEach((node, index) => {
      node.move({ parent: null });
      node.position({
        x: (index % cols) * gapX,
        y: Math.floor(index / cols) * gapY,
      });
    });
  });

  fitVisible(cy);
}

function applyAuthorLayout(cy: cytoscape.Core, books: Book[]) {
  cy.batch(() => {
    cy.nodes(BOOK_NODE_SELECTOR).move({ parent: null });
  });

  const authorMap = new Map<string, string[]>();
  for (const book of books) {
    const author = book.authors?.[0]?.trim();
    if (!author) continue;
    if (!authorMap.has(author)) authorMap.set(author, []);
    authorMap.get(author)!.push(book.id);
  }

  const groups: Array<{ author: string; ids: string[] }> = [];
  const groupedIds = new Set<string>();
  authorMap.forEach((ids, author) => {
    if (ids.length >= 2) {
      groups.push({ author, ids });
      ids.forEach((id) => groupedIds.add(id));
    }
  });

  const clusterCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, groups.length))));
  const clusterGapX = 300;
  const clusterGapY = 260;
  const itemGapX = 112;
  const itemGapY = 160;

  cy.batch(() => {
    groups.forEach(({ ids }, groupIndex) => {
      const baseX = (groupIndex % clusterCols) * clusterGapX;
      const baseY = Math.floor(groupIndex / clusterCols) * clusterGapY;
      const cols = Math.min(3, Math.ceil(Math.sqrt(ids.length)));
      const rows = Math.ceil(ids.length / cols);
      const startX = baseX - ((cols - 1) * itemGapX) / 2;
      const startY = baseY - ((rows - 1) * itemGapY) / 2 + 18;

      ids.forEach((bookId, index) => {
        const node = cy.getElementById(bookId);
        if (!node.length) return;
        node.move({ parent: null });
        node.position({
          x: startX + (index % cols) * itemGapX,
          y: startY + Math.floor(index / cols) * itemGapY,
        });
      });
    });

    const singleStartY = Math.ceil(groups.length / clusterCols) * clusterGapY + 48;
    let singleIndex = 0;
    cy.nodes(BOOK_NODE_SELECTOR).forEach((node) => {
      if (groupedIds.has(node.id())) return;
      node.move({ parent: null });
      node.position({
        x: (singleIndex % 5) * itemGapX,
        y: singleStartY + Math.floor(singleIndex / 5) * itemGapY,
      });
      singleIndex += 1;
    });
  });

  fitVisible(cy);
}

export function BookGraph({
  data,
  enabledTypes,
  selectedId,
  onSelectBook,
  layoutKey,
  focusRequest,
  groupByAuthor,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const booksRef = useRef(data.books);
  const groupByAuthorRef = useRef(groupByAuthor);
  const onSelectBookRef = useRef(onSelectBook);
  const positionsLoadedRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const isSelectModeRef = useRef(false);
  const [favorites, setFavorites] = useState<FavoriteLayout[]>(() => loadFavorites());
  const [showFavPanel, setShowFavPanel] = useState(false);
  const [newFavName, setNewFavName] = useState('');

  useEffect(() => {
    isSelectModeRef.current = isSelectMode;
  }, [isSelectMode]);

  useEffect(() => {
    booksRef.current = data.books;
  }, [data.books]);

  useEffect(() => {
    onSelectBookRef.current = onSelectBook;
  }, [onSelectBook]);

  useEffect(() => {
    groupByAuthorRef.current = groupByAuthor;
  }, [groupByAuthor]);

  const applyCurrentLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (groupByAuthorRef.current) applyAuthorLayout(cy, booksRef.current);
    else applyGridLayout(cy);
    setZoom(cy.zoom());
    saveCurrentPositions(cy);
  }, []);

  const scheduleLayout = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(applyCurrentLayout);
    });
  }, [applyCurrentLayout]);

  const handleResetZoom = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    fitVisible(cy);
    setZoom(cy.zoom());
  }, []);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      const next = !prev;
      const cy = cyRef.current;
      if (cy) {
        cy.userPanningEnabled(!next);
        cy.boxSelectionEnabled(next);
        if (next) {
          cy.minZoom(0.05);
        } else {
          cy.elements().unselect();
        }
      }
      return next;
    });
  }, []);

  const handleSaveFavorite = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !newFavName.trim()) return;
    const positions: PositionMap = {};
    cy.nodes(BOOK_NODE_SELECTOR).forEach((node) => {
      positions[node.id()] = { ...node.position() };
    });
    saveFavorite(newFavName.trim(), positions);
    setFavorites(loadFavorites());
    setNewFavName('');
  }, [newFavName]);

  const handleRestoreFavorite = useCallback((fav: FavoriteLayout) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      for (const [id, pos] of Object.entries(fav.positions)) {
        const node = cy.getElementById(id);
        if (node.length) node.position({ ...pos });
      }
    });
    fitVisible(cy);
    setZoom(cy.zoom());
    saveCurrentPositions(cy);
    setShowFavPanel(false);
  }, []);

  const handleDeleteFavorite = useCallback((id: string) => {
    deleteFavorite(id);
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const handleWheel = (e: WheelEvent) => {
      if (!isSelectModeRef.current) return;
      const cyInst = cyRef.current;
      if (!cyInst) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = container.getBoundingClientRect();
      cyInst.zoom({
        level: Math.max(0.05, Math.min(10, cyInst.zoom() * factor)),
        renderedPosition: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      });
    };
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    const cy = cytoscape({
      container,
      style: [
        {
          selector: 'node.book-node',
          style: {
            'background-color': '#1E293B',
            'border-width': 2,
            'border-color': '#475569',
            label: 'data(label)',
            color: '#F8FAFC',
            'font-size': 9,
            'font-weight': 700,
            'line-height': 1.2,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': -7,
            'text-wrap': 'wrap',
            'text-max-width': '84px',
            'text-background-color': '#0F172A',
            'text-background-opacity': 0.72,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            width: 92,
            height: 142,
            shape: 'round-rectangle',
            'background-opacity': 1,
          },
        },
        {
          selector: 'node[cover]',
          style: {
            'background-image': 'data(cover)',
            'background-fit': 'contain',
            'background-clip': 'node',
            'background-position-x': '50%',
            'background-position-y': '6%',
            'background-width': '92%',
            'background-height': '76%',
          },
        },
        {
          selector: 'node[?read]',
          style: { 'border-color': '#22C55E', 'border-width': 2 },
        },
        {
          selector: 'node:selected',
          style: { 'border-color': '#F59E0B', 'border-width': 3 },
        },
        {
          selector: 'node.highlighted',
          style: { 'border-color': '#F59E0B', 'border-width': 3 },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 9,
            color: '#94A3B8',
            'text-rotation': 'autorotate',
            opacity: 0.8,
          },
        },
        {
          selector: 'edge.hidden',
          style: { display: 'none' },
        },
      ],
      layout: { name: 'preset' },
      boxSelectionEnabled: false,
    });

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveCurrentPositions(cy), 80);
    };

    cy.on('zoom', () => setZoom(cy.zoom()));
    cy.on('tap', `node${BOOK_NODE_SELECTOR}`, (event) => onSelectBookRef.current(event.target.id()));
    cy.on('dragfree', `node${BOOK_NODE_SELECTOR}`, debouncedSave);

    cyRef.current = cy;
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      if (saveTimer) clearTimeout(saveTimer);
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    let cancelled = false;
    const existingNodeIds = new Set(cy.nodes(BOOK_NODE_SELECTOR).map((node) => node.id()));
    const newBookIds = new Set(data.books.map((book) => book.id));
    let changed = false;
    let removed = false;

    cy.nodes(BOOK_NODE_SELECTOR).forEach((node) => {
      if (newBookIds.has(node.id())) return;
      node.remove();
      changed = true;
      removed = true;
    });

    function asyncLoadCover(bookId: string, proxyUrl: string, fallback: string) {
      const cyInst = cyRef.current;
      if (!cyInst) return;
      const img = new window.Image();
      img.onload = () => {
        if (cancelled) return;
        const node = cyInst.getElementById(bookId);
        if (node.length) node.data('cover', proxyUrl);
      };
      img.onerror = () => {
        if (cancelled) return;
        const node = cyInst.getElementById(bookId);
        if (node.length) node.data('cover', fallback);
      };
      img.src = proxyUrl;
    }

    const added: cytoscape.ElementDefinition[] = [];
    for (const book of data.books) {
      const generated = generatedCoverForBook(book);
      const proxyUrl = coverForBook(book);
      const isDataUri = proxyUrl.startsWith('data:');

      if (existingNodeIds.has(book.id)) {
        const node = cy.getElementById(book.id);
        node.data('title', book.title);
        node.data('author', book.authors?.[0] ?? '');
        node.data('label', nodeLabel(book));
        node.data('read', book.read ?? false);
        node.data('cover', isDataUri ? proxyUrl : generated);
        if (!isDataUri) asyncLoadCover(book.id, proxyUrl, generated);
      } else {
        added.push({
          data: {
            id: book.id,
            title: book.title,
            author: book.authors?.[0] ?? '',
            label: nodeLabel(book),
            read: book.read ?? false,
            cover: isDataUri ? proxyUrl : generated,
          },
          classes: 'book-node',
        });
        if (!isDataUri) asyncLoadCover(book.id, proxyUrl, generated);
      }
    }

    if (added.length > 0) {
      cy.add(added);
      changed = true;
    }

    if (changed) {
      const saved = loadPositions();
      if (!positionsLoadedRef.current) {
        positionsLoadedRef.current = true;
        const allSaved = data.books.length > 0 && data.books.every((b) => saved[b.id]);
        if (allSaved) {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const c = cyRef.current;
              if (!c || cancelled) return;
              restoreSavedPositions(c, data.books, saved);
              fitVisible(c);
              setZoom(c.zoom());
            });
          });
        } else {
          scheduleLayout();
        }
      } else if (added.some((node) => !saved[String(node.data.id)])) {
        scheduleLayout();
      } else {
        if (added.length > 0) restoreSavedPositions(cy, data.books, saved);
        if (removed || added.length > 0) {
          fitVisible(cy);
          setZoom(cy.zoom());
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, [data.books, scheduleLayout]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingEdgeIds = new Set(cy.edges().map((edge) => edge.id()));
    const newRelIds = new Set(data.relationships.map((rel) => rel.id));

    cy.edges().forEach((edge) => {
      if (!newRelIds.has(edge.id())) edge.remove();
    });

    for (const rel of data.relationships) {
      if (existingEdgeIds.has(rel.id)) continue;
      if (!cy.getElementById(rel.source).length || !cy.getElementById(rel.target).length) continue;
      cy.add({
        data: {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          color: REL_COLORS[rel.type],
          label: rel.label ?? '',
        },
      });
    }

    cy.edges().forEach((edge) => {
      const relType = data.relationships.find((rel) => rel.id === edge.id())?.type;
      if (relType && !enabledTypes.has(relType)) edge.addClass('hidden');
      else edge.removeClass('hidden');
    });
  }, [data.relationships, enabledTypes]);

  useEffect(() => {
    scheduleLayout();
  }, [groupByAuthor, layoutKey, scheduleLayout]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes(BOOK_NODE_SELECTOR).removeClass('highlighted');
    if (!selectedId) return;

    const node = cy.getElementById(selectedId);
    if (!node.length) return;
    node.addClass('highlighted');
  }, [selectedId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focusRequest) return;

    const [bookId] = focusRequest.split('::');
    const node = cy.getElementById(bookId);
    if (!node.length) return;

    const currentZoom = cy.zoom();
    const position = node.position();
    cy.animate(
      {
        pan: {
          x: cy.width() / 2 - position.x * currentZoom,
          y: cy.height() / 2 - position.y * currentZoom,
        },
      },
      { duration: 200 }
    );
    setZoom(currentZoom);
  }, [focusRequest]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: isSelectMode ? 'crosshair' : 'default' }} />

      <button
        className={`select-mode-btn${isSelectMode ? ' active' : ''}`}
        onClick={toggleSelectMode}
        title={isSelectMode ? '選択モード中（クリックで移動モードへ）' : 'クリックで複数選択モードへ'}
      >
        {isSelectMode ? '✕ 選択中' : '⬚ 囲む'}
      </button>

      {/* Favorites panel */}
      <div className="fav-panel">
        <button
          className={`fav-toggle-btn${showFavPanel ? ' active' : ''}`}
          onClick={() => setShowFavPanel((p) => {
            if (!p) {
              const now = new Date();
              const pad = (n: number) => String(n).padStart(2, '0');
              setNewFavName(`${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`);
            }
            return !p;
          })}
        >
          ★ お気に入り{favorites.length > 0 ? `（${favorites.length}）` : ''}
        </button>
        {showFavPanel && (
          <div className="fav-dropdown">
            <div className="fav-save-row">
              <input
                className="fav-name-input"
                value={newFavName}
                onChange={(e) => setNewFavName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveFavorite()}
                placeholder="配置名を入力..."
              />
              <button
                className="fav-save-btn"
                onClick={handleSaveFavorite}
                disabled={!newFavName.trim()}
              >
                保存
              </button>
            </div>
            {favorites.length > 0 && (
              <ul className="fav-list">
                {favorites.map((fav) => (
                  <li key={fav.id} className="fav-item">
                    <span className="fav-item-name">{fav.name}</span>
                    <button className="fav-restore-btn" onClick={() => handleRestoreFavorite(fav)}>復元</button>
                    <button className="fav-delete-btn" onClick={() => handleDeleteFavorite(fav.id)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            {favorites.length === 0 && (
              <p className="fav-empty">まだ保存した配置はありません</p>
            )}
          </div>
        )}
      </div>

      <div className="zoom-overlay">
        <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
        <button className="zoom-reset-btn" onClick={handleResetZoom} title="100%に戻す">↺</button>
      </div>
    </div>
  );
}
