import { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Book, GraphData, RelationshipType } from '../types';
import { REL_COLORS } from '../types';
import { loadPositions, savePositions, type PositionMap } from '../lib/positions';
import { loadFavorites, saveFavorite, deleteFavorite, type FavoriteLayout } from '../lib/favorites';
import type { DrawStroke, TextLabel } from '../types';

interface Props {
  data: GraphData;
  enabledTypes: Set<RelationshipType>;
  selectedId: string | null;
  onSelectBook: (id: string) => void;
  layoutKey: number;
  focusRequest: string | null;
  groupByAuthor: boolean;
  textLabels: TextLabel[];
  onAddTextLabel: (id: string, text: string, kind: 'text' | 'frame', w?: number, h?: number) => void;
  onUpdateTextLabel: (id: string, text: string) => void;
  onDeleteTextLabel: (id: string) => void;
  drawStrokes: DrawStroke[];
  onAddDrawStroke: (stroke: DrawStroke) => void;
  onUndoDrawStroke: () => void;
  onClearDrawStrokes: () => void;
  onSetDrawStrokes: (strokes: DrawStroke[]) => void;
  categories: string[];
  onBulkUpdateBooks: (ids: string[], patch: Partial<import('../types').Book>) => void;
}

type EditingLabel = { id: string; text: string; x: number; y: number; kind: 'text' | 'frame' };

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

function supportsTouchInput(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

const ANNOTATION_SELECTOR = '.annotation-node';

function saveCurrentPositions(cy: cytoscape.Core) {
  const positions: PositionMap = loadPositions();
  cy.nodes(`${BOOK_NODE_SELECTOR}, ${ANNOTATION_SELECTOR}`).forEach((node) => {
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
  textLabels,
  onAddTextLabel,
  onUpdateTextLabel,
  onDeleteTextLabel,
  drawStrokes,
  onAddDrawStroke,
  onUndoDrawStroke,
  onClearDrawStrokes,
  onSetDrawStrokes,
  categories,
  onBulkUpdateBooks,
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
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragBox, setDragBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const overlayDragNodeRef = useRef<{ nodeId: string; startNodeX: number; startNodeY: number; startTouchX: number; startTouchY: number } | null>(null);
  const selectedNodesStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isTouchDevice = useRef(supportsTouchInput());
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);
  const [placingKind, setPlacingKind] = useState<'text' | 'frame' | null>(null);
  const placingKindRef = useRef<'text' | 'frame' | null>(null);
  const placeDragStartRef2 = useRef<{ sx: number; sy: number } | null>(null);
  const [placeDragBox, setPlaceDragBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const isEraserModeRef = useRef(false);
  const [drawColor, setDrawColor] = useState('#F87171');
  const [drawWidth, setDrawWidth] = useState(3);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawStroke | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const drawColorRef = useRef('#F87171');
  const drawWidthRef = useRef(3);
  const drawStrokesRef = useRef<DrawStroke[]>([]);
  const drawRafRef = useRef<number | null>(null);

  useEffect(() => {
    isSelectModeRef.current = isSelectMode;
    if (!isSelectMode) {
      dragStartRef.current = null;
      dragBoxRef.current = null;
      setDragBox(null);
    }
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
        if (isTouchDevice.current) {
          // Touch: overlay intercepts all touch, Cytoscape settings unchanged
          if (!next) cy.elements().unselect();
        } else {
          // Mouse: Cytoscape native box selection
          cy.userPanningEnabled(!next);
          cy.boxSelectionEnabled(next);
          if (next) cy.minZoom(0.05);
          else cy.elements().unselect();
        }
      }
      return next;
    });
  }, []);

  const handleSaveFavorite = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !newFavName.trim()) return;
    const positions: PositionMap = {};
    cy.nodes(`${BOOK_NODE_SELECTOR}, ${ANNOTATION_SELECTOR}`).forEach((node) => {
      positions[node.id()] = { ...node.position() };
    });
    saveFavorite(newFavName.trim(), positions, drawStrokesRef.current);
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
    onSetDrawStrokes(fav.drawStrokes ?? []);
    setShowFavPanel(false);
  }, [onSetDrawStrokes]);

  const handleDeleteFavorite = useCallback((id: string) => {
    deleteFavorite(id);
    setFavorites(loadFavorites());
  }, []);

  // ── Drawing ───────────────────────────────────────────────────────────────────
  useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);
  useEffect(() => { drawWidthRef.current = drawWidth; }, [drawWidth]);
  useEffect(() => { isEraserModeRef.current = isEraserMode; }, [isEraserMode]);
  useEffect(() => {
    drawStrokesRef.current = drawStrokes;
    scheduleDrawRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawStrokes]);

  const scheduleDrawRedraw = useCallback(() => {
    if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      const canvas = drawCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pan = panRef.current;
      const zoom = zoomRef.current;

      function renderStroke(points: Array<{ x: number; y: number }>, color: string, width: number) {
        if (points.length < 2) return;
        ctx!.beginPath();
        ctx!.strokeStyle = color;
        ctx!.lineWidth = width;
        ctx!.lineCap = 'round';
        ctx!.lineJoin = 'round';
        ctx!.moveTo(points[0].x * zoom + pan.x, points[0].y * zoom + pan.y);
        for (let i = 1; i < points.length; i++) {
          ctx!.lineTo(points[i].x * zoom + pan.x, points[i].y * zoom + pan.y);
        }
        ctx!.stroke();
      }

      function renderAnyStroke(s: DrawStroke) {
        ctx!.save();
        if (s.eraser) {
          ctx!.globalCompositeOperation = 'destination-out';
          renderStroke(s.points, 'rgba(0,0,0,1)', s.width * 6);
        } else {
          ctx!.globalCompositeOperation = 'source-over';
          renderStroke(s.points, s.color, s.width);
        }
        ctx!.restore();
      }

      for (const s of drawStrokesRef.current) renderAnyStroke(s);
      if (currentStrokeRef.current) renderAnyStroke(currentStrokeRef.current);
    });
  }, []);

  const handleDrawTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = touch.clientX - rect.left;
    const sy = touch.clientY - rect.top;
    const mx = (sx - panRef.current.x) / zoomRef.current;
    const my = (sy - panRef.current.y) / zoomRef.current;
    currentStrokeRef.current = { id: `stroke_${Date.now()}`, points: [{ x: mx, y: my }], color: drawColorRef.current, width: drawWidthRef.current, eraser: isEraserModeRef.current };
    isDrawingRef.current = true;
    scheduleDrawRedraw();
  }, [scheduleDrawRedraw]);

  const handleDrawTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current || e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = touch.clientX - rect.left;
    const sy = touch.clientY - rect.top;
    const mx = (sx - panRef.current.x) / zoomRef.current;
    const my = (sy - panRef.current.y) / zoomRef.current;
    currentStrokeRef.current!.points.push({ x: mx, y: my });
    scheduleDrawRedraw();
  }, [scheduleDrawRedraw]);

  const handleDrawTouchEnd = useCallback(() => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    scheduleDrawRedraw();
    if (stroke.points.length >= 2) onAddDrawStroke(stroke);
  }, [onAddDrawStroke, scheduleDrawRedraw]);
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Text label / frame placement handlers ───────────────────────────────────
  useEffect(() => { placingKindRef.current = placingKind; }, [placingKind]);

  const handlePlaceDown = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    placeDragStartRef2.current = { sx: clientX - rect.left, sy: clientY - rect.top };
    setPlaceDragBox(null);
  }, []);

  const handlePlaceMove = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const start = placeDragStartRef2.current;
    if (!start) return;
    const ex = clientX - rect.left;
    const ey = clientY - rect.top;
    setPlaceDragBox({
      x: Math.min(start.sx, ex),
      y: Math.min(start.sy, ey),
      w: Math.abs(ex - start.sx),
      h: Math.abs(ey - start.sy),
    });
  }, []);

  const handlePlaceUp = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const start = placeDragStartRef2.current;
    placeDragStartRef2.current = null;
    setPlaceDragBox(null);
    const kind = placingKindRef.current;
    if (!start || !kind) return;
    const ex = clientX - rect.left;
    const ey = clientY - rect.top;
    if (Math.abs(ex - start.sx) < 20 || Math.abs(ey - start.sy) < 20) return;
    const cy = cyRef.current;
    if (!cy) return;
    const pan = cy.pan();
    const z = cy.zoom();
    const sx1 = Math.min(start.sx, ex), sy1 = Math.min(start.sy, ey);
    const sx2 = Math.max(start.sx, ex), sy2 = Math.max(start.sy, ey);
    const mx1 = (sx1 - pan.x) / z, my1 = (sy1 - pan.y) / z;
    const mx2 = (sx2 - pan.x) / z, my2 = (sy2 - pan.y) / z;
    const cx = (mx1 + mx2) / 2, cyCoord = (my1 + my2) / 2;
    const w = mx2 - mx1, h = my2 - my1;
    const id = `label_${Date.now()}`;
    const nodeData: Record<string, unknown> = { id, text: '', kind, w, h };
    if (kind === 'text') nodeData.textMaxWidth = Math.max(40, w - 16);
    const classes = `annotation-node ${kind === 'frame' ? 'frame-node' : 'text-label-node'}`;
    cy.add({ data: nodeData, position: { x: cx, y: cyCoord }, classes });
    const positions = loadPositions();
    positions[id] = { x: cx, y: cyCoord };
    savePositions(positions);
    onAddTextLabel(id, '', kind, w, h);
    setPlacingKind(null);
    if (kind === 'text') {
      setEditingLabel({ id, text: '', kind, x: (sx1 + sx2) / 2, y: (sy1 + sy2) / 2 });
    }
  }, [onAddTextLabel]);

  const handleSaveEditingLabel = useCallback(() => {
    if (!editingLabel) return;
    const cy = cyRef.current;
    if (cy) cy.getElementById(editingLabel.id).data('text', editingLabel.text);
    onUpdateTextLabel(editingLabel.id, editingLabel.text);
    setEditingLabel(null);
  }, [editingLabel, onUpdateTextLabel]);

  const handleDeleteEditingLabel = useCallback(() => {
    if (!editingLabel) return;
    cyRef.current?.getElementById(editingLabel.id).remove();
    onDeleteTextLabel(editingLabel.id);
    setEditingLabel(null);
  }, [editingLabel, onDeleteTextLabel]);
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Touch overlay handlers (iPad / touch devices, select mode only) ─────────
  const handleOverlayTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const cy = cyRef.current;
    if (!cy) return;
    const rect = e.currentTarget.getBoundingClientRect();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const hitNode = cy.nodes(BOOK_NODE_SELECTOR).filter((node) => {
        const bb = node.renderedBoundingBox();
        return x >= bb.x1 && x <= bb.x2 && y >= bb.y1 && y <= bb.y2;
      }).first() as cytoscape.NodeSingular;

      if (hitNode.length > 0) {
        const nodeId = hitNode.id();
        const nodePos = hitNode.position();
        const startPositions = new Map<string, { x: number; y: number }>();
        if (hitNode.selected()) {
          cy.nodes(':selected').forEach((n) => { startPositions.set(n.id(), { ...n.position() }); });
        } else {
          startPositions.set(nodeId, { ...nodePos });
        }
        selectedNodesStartRef.current = startPositions;
        overlayDragNodeRef.current = {
          nodeId,
          startNodeX: nodePos.x,
          startNodeY: nodePos.y,
          startTouchX: touch.clientX,
          startTouchY: touch.clientY,
        };
        dragStartRef.current = null;
        dragBoxRef.current = null;
      } else {
        overlayDragNodeRef.current = null;
        selectedNodesStartRef.current = new Map();
        dragStartRef.current = { x, y };
        dragBoxRef.current = { x, y, w: 0, h: 0 };
      }
      pinchRef.current = null;

    } else if (e.touches.length === 2) {
      dragStartRef.current = null;
      dragBoxRef.current = null;
      setDragBox(null);
      overlayDragNodeRef.current = null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchRef.current = {
        dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      };
    }
  }, []);

  const handleOverlayTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const cy = cyRef.current;
    if (!cy) return;
    const rect = e.currentTarget.getBoundingClientRect();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (overlayDragNodeRef.current) {
        const { startTouchX, startTouchY } = overlayDragNodeRef.current;
        const zoom = cy.zoom();
        const dx = (touch.clientX - startTouchX) / zoom;
        const dy = (touch.clientY - startTouchY) / zoom;
        cy.batch(() => {
          selectedNodesStartRef.current.forEach((startPos, nodeId) => {
            const node = cy.getElementById(nodeId);
            if (node.length) node.position({ x: startPos.x + dx, y: startPos.y + dy });
          });
        });
      } else if (dragStartRef.current) {
        const start = dragStartRef.current;
        const box = {
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          w: Math.abs(x - start.x),
          h: Math.abs(y - start.y),
        };
        dragBoxRef.current = box;
        setDragBox({ ...box });
      }

    } else if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const newMidX = (t1.clientX + t2.clientX) / 2;
      const newMidY = (t1.clientY + t2.clientY) / 2;
      const { dist: oldDist, midX: oldMidX, midY: oldMidY } = pinchRef.current;

      if (oldDist > 0) {
        cy.zoom({
          level: Math.max(0.05, Math.min(10, cy.zoom() * (newDist / oldDist))),
          renderedPosition: { x: newMidX - rect.left, y: newMidY - rect.top },
        });
      }
      cy.panBy({ x: newMidX - oldMidX, y: newMidY - oldMidY });
      setZoom(cy.zoom());
      pinchRef.current = { dist: newDist, midX: newMidX, midY: newMidY };
    }
  }, []);

  const handleOverlayTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const cy = cyRef.current;
    if (!cy) return;

    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length > 0) return;

    if (overlayDragNodeRef.current) {
      const drag = overlayDragNodeRef.current;
      const lastTouch = e.changedTouches[0];
      const movedX = Math.abs(lastTouch.clientX - drag.startTouchX);
      const movedY = Math.abs(lastTouch.clientY - drag.startTouchY);
      if (movedX < 8 && movedY < 8) {
        onSelectBookRef.current(drag.nodeId);
      } else {
        saveCurrentPositions(cy);
      }
      setZoom(cy.zoom());
      overlayDragNodeRef.current = null;
      selectedNodesStartRef.current = new Map();

    } else if (dragStartRef.current) {
      const box = dragBoxRef.current;
      dragStartRef.current = null;
      dragBoxRef.current = null;
      setDragBox(null);

      if (!box || (box.w < 10 && box.h < 10)) {
        cy.elements().unselect();
        return;
      }
      cy.nodes(BOOK_NODE_SELECTOR).forEach((node) => {
        const bb = node.renderedBoundingBox();
        const cx = (bb.x1 + bb.x2) / 2;
        const cy2 = (bb.y1 + bb.y2) / 2;
        if (cx >= box.x && cx <= box.x + box.w && cy2 >= box.y && cy2 <= box.y + box.h) {
          node.select();
        } else {
          node.unselect();
        }
      });
      setZoom(cy.zoom());
    }
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

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
        {
          selector: 'node.text-label-node',
          style: {
            shape: 'round-rectangle',
            'background-color': '#0F172A',
            'background-opacity': 0.88,
            'border-color': '#64748B',
            'border-width': 1,
            'border-style': 'dashed',
            color: '#CBD5E1',
            'font-size': 13,
            label: 'data(text)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '220px',
            width: 'label',
            height: 'label',
            padding: '8px',
            'z-index': 3,
          },
        },
        {
          selector: 'node.frame-node',
          style: {
            shape: 'round-rectangle',
            'background-color': '#1E293B',
            'background-opacity': 0.35,
            'border-color': '#475569',
            'border-width': 2,
            'border-style': 'solid',
            color: '#94A3B8',
            'font-size': 12,
            'font-weight': 700,
            label: 'data(text)',
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': 10,
            width: 340,
            height: 260,
            'z-index': 0,
          },
        },
        {
          selector: 'node.annotation-node:selected',
          style: { 'border-color': '#3B82F6', 'border-width': 2 },
        },
        {
          selector: 'node.text-label-node[w]',
          style: { width: 'data(w)', height: 'data(h)', 'text-max-width': 'data(textMaxWidth)' },
        },
        {
          selector: 'node.frame-node[w]',
          style: { width: 'data(w)', height: 'data(h)' },
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

    // Size the draw canvas to match the container
    const drawCanvas = drawCanvasRef.current;
    if (drawCanvas) {
      drawCanvas.width = container.offsetWidth;
      drawCanvas.height = container.offsetHeight;
    }

    cy.on('zoom', () => { const z = cy.zoom(); zoomRef.current = z; setZoom(z); scheduleDrawRedraw(); });
    cy.on('pan', () => { panRef.current = cy.pan(); scheduleDrawRedraw(); });
    cy.on('tap', `node${BOOK_NODE_SELECTOR}`, (event) => onSelectBookRef.current(event.target.id()));
    cy.on('tap', `node${ANNOTATION_SELECTOR}`, (event) => {
      if (isSelectModeRef.current) return;
      const node = event.target;
      const rp = node.renderedPosition();
      setEditingLabel({
        id: node.id(),
        text: node.data('text') ?? '',
        kind: node.data('kind') ?? 'text',
        x: rp.x,
        y: rp.y,
      });
    });
    cy.on('dragfree', `node${BOOK_NODE_SELECTOR}, node${ANNOTATION_SELECTOR}`, debouncedSave);

    const updateSelection = () => {
      const ids = cy.nodes(`${BOOK_NODE_SELECTOR}:selected`).map((n) => n.id());
      setSelectedNodeIds(ids);
    };
    cy.on('select unselect', BOOK_NODE_SELECTOR, updateSelection);

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
        if (added.length > 0) {
          fitVisible(cy);
        }
        if (removed || added.length > 0) setZoom(cy.zoom());
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const existingIds = new Set(cy.nodes(ANNOTATION_SELECTOR).map((n) => n.id()));
    const newIds = new Set(textLabels.map((l) => l.id));
    cy.nodes(ANNOTATION_SELECTOR).forEach((n) => { if (!newIds.has(n.id())) n.remove(); });
    const saved = loadPositions();
    for (const label of textLabels) {
      if (existingIds.has(label.id)) {
        const node = cy.getElementById(label.id);
        node.data('text', label.text);
        if (label.w !== undefined) {
          node.data('w', label.w);
          node.data('h', label.h);
          if (label.kind === 'text') node.data('textMaxWidth', Math.max(40, label.w - 16));
        }
      } else {
        const pos = saved[label.id] ?? (() => {
          const pan = cy.pan(); const zoom = cy.zoom();
          return { x: (cy.width() / 2 - pan.x) / zoom, y: (cy.height() / 2 - pan.y) / zoom };
        })();
        const nodeData: Record<string, unknown> = { id: label.id, text: label.text, kind: label.kind };
        if (label.w !== undefined) {
          nodeData.w = label.w;
          nodeData.h = label.h;
          if (label.kind === 'text') nodeData.textMaxWidth = Math.max(40, label.w - 16);
        }
        const classes = `annotation-node ${label.kind === 'frame' ? 'frame-node' : 'text-label-node'}`;
        cy.add({ data: nodeData, position: pos, classes });
      }
    }
  }, [textLabels]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: isDrawMode ? 'crosshair' : isSelectMode ? 'crosshair' : 'default' }} />

      {/* Drawing canvas */}
      <canvas ref={drawCanvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }} />

      {/* Draw mode touch overlay */}
      {isDrawMode && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 7, touchAction: 'none' }}
          onTouchStart={handleDrawTouchStart}
          onTouchMove={handleDrawTouchMove}
          onTouchEnd={handleDrawTouchEnd}
          onTouchCancel={handleDrawTouchEnd}
        />
      )}

      {/* Touch overlay: enabled by CSS only on coarse pointer devices */}
      {isSelectMode && !isDrawMode && (
        <div
          className="touch-select-overlay"
          onTouchStart={handleOverlayTouchStart}
          onTouchMove={handleOverlayTouchMove}
          onTouchEnd={handleOverlayTouchEnd}
          onTouchCancel={handleOverlayTouchEnd}
        />
      )}

      {dragBox && dragBox.w > 4 && (
        <div style={{
          position: 'absolute',
          left: dragBox.x,
          top: dragBox.y,
          width: dragBox.w,
          height: dragBox.h,
          border: '1.5px solid #3B82F6',
          background: 'rgba(59,130,246,0.10)',
          borderRadius: 2,
          pointerEvents: 'none',
          zIndex: 6,
        }} />
      )}

      <button
        className={`select-mode-btn${isSelectMode ? ' active' : ''}`}
        onClick={toggleSelectMode}
        title={isSelectMode ? '選択モード中（クリックで移動モードへ）' : 'クリックで複数選択モードへ'}
      >
        {isSelectMode ? '✕ 選択中' : '⬚ 囲む'}
      </button>

      {/* Bulk category panel (shown when 2+ nodes selected in select mode) */}
      {isSelectMode && selectedNodeIds.length >= 2 && (
        <div className="bulk-panel">
          <span className="bulk-panel-count">{selectedNodeIds.length}冊選択中</span>
          <select
            className="bulk-category-select"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
          >
            <option value="">カテゴリを選択…</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="bulk-apply-btn"
            disabled={!bulkCategory}
            onClick={() => {
              onBulkUpdateBooks(selectedNodeIds, { category: bulkCategory });
              setBulkCategory('');
              cyRef.current?.nodes(`${BOOK_NODE_SELECTOR}:selected`).unselect();
            }}
          >
            適用
          </button>
        </div>
      )}

      {/* Placement overlay: drag to define shape bounds */}
      {placingKind && !isDrawMode && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 8, cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={(e) => handlePlaceDown(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
          onMouseMove={(e) => { if (placeDragStartRef2.current) handlePlaceMove(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
          onMouseUp={(e) => handlePlaceUp(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
          onTouchStart={(e) => { e.preventDefault(); const t = e.touches[0]; handlePlaceDown(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect()); }}
          onTouchMove={(e) => { e.preventDefault(); const t = e.touches[0]; handlePlaceMove(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect()); }}
          onTouchEnd={(e) => { e.preventDefault(); const t = e.changedTouches[0]; handlePlaceUp(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect()); }}
          onTouchCancel={() => { placeDragStartRef2.current = null; setPlaceDragBox(null); }}
        />
      )}

      {/* Placement preview */}
      {placeDragBox && placeDragBox.w > 4 && (
        <div style={{
          position: 'absolute',
          left: placeDragBox.x,
          top: placeDragBox.y,
          width: placeDragBox.w,
          height: placeDragBox.h,
          border: `1.5px dashed ${placingKind === 'frame' ? '#60A5FA' : '#A78BFA'}`,
          background: placingKind === 'frame' ? 'rgba(30,41,59,0.25)' : 'rgba(15,23,42,0.35)',
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 9,
        }} />
      )}

      {/* Annotation buttons */}
      <div className="annotation-btns">
        <button className={`annotation-btn${placingKind === 'text' ? ' active' : ''}`} onClick={() => setPlacingKind((k) => k === 'text' ? null : 'text')} title="ドラッグしてテキストを追加">📝 テキスト</button>
        <button className={`annotation-btn${placingKind === 'frame' ? ' active' : ''}`} onClick={() => setPlacingKind((k) => k === 'frame' ? null : 'frame')} title="ドラッグして枠を追加">⬜ 枠</button>
        <button className={`annotation-btn${isDrawMode ? ' active' : ''}`} onClick={() => { setIsDrawMode((p) => !p); setIsEraserMode(false); }} title="自由描画">✏️ 描画</button>
      </div>

      {/* Draw toolbar */}
      {isDrawMode && (
        <div className="draw-toolbar">
          <div className="draw-toolbar-colors" style={{ opacity: isEraserMode ? 0.35 : 1, pointerEvents: isEraserMode ? 'none' : 'auto' }}>
            {(['#F87171','#FCD34D','#34D399','#60A5FA','#C084FC','#F1F5F9'] as const).map((c) => (
              <button key={c} className={`draw-color-swatch${drawColor === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setDrawColor(c)} />
            ))}
          </div>
          <div className="draw-toolbar-widths" style={{ opacity: isEraserMode ? 0.35 : 1, pointerEvents: isEraserMode ? 'none' : 'auto' }}>
            {([2, 4, 8] as const).map((w) => (
              <button key={w} className={`draw-width-btn${drawWidth === w ? ' active' : ''}`} onClick={() => setDrawWidth(w)}>
                <span className="draw-width-dot" style={{ width: w * 3, height: w * 3 }} />
              </button>
            ))}
          </div>
          <div className="draw-toolbar-actions">
            <button
              className={`draw-action-btn${isEraserMode ? ' active' : ''}`}
              onClick={() => setIsEraserMode((p) => !p)}
              title="消しゴム"
            >🧹</button>
            <button className="draw-action-btn" onClick={onUndoDrawStroke} title="1つ戻す">↩</button>
            <button className="draw-action-btn" onClick={() => { if (window.confirm('描画をすべて消しますか？')) onClearDrawStrokes(); }} title="全消去">🗑</button>
          </div>
        </div>
      )}


      {/* Edit annotation panel */}
      {editingLabel && (
        <div className="annotation-edit-panel" style={{ left: Math.max(8, editingLabel.x - 110), top: Math.max(8, editingLabel.y - 130) }}>
          <textarea
            className="annotation-textarea"
            autoFocus
            value={editingLabel.text}
            onChange={(e) => setEditingLabel({ ...editingLabel, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditingLabel(null);
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEditingLabel(); }
            }}
            rows={3}
          />
          <div className="annotation-add-actions">
            <button className="btn-primary" onClick={handleSaveEditingLabel}>保存</button>
            <button className="annotation-delete-btn" onClick={handleDeleteEditingLabel}>削除</button>
            <button className="annotation-cancel-btn" onClick={() => setEditingLabel(null)}>✕</button>
          </div>
        </div>
      )}

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
