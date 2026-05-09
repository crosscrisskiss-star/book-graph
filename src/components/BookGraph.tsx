import { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
// @ts-expect-error no types bundled
import cola from 'cytoscape-cola';
import type { Book, GraphData, RelationshipType } from '../types';
import { REL_COLORS } from '../types';

cytoscape.use(cola);

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

function groupNodeId(author: string): string {
  return `author_group::${author}`;
}

function nodeLabel(book: Book): string {
  const title = book.title.length > 15 ? `${book.title.slice(0, 14)}...` : book.title;
  const author = book.authors?.[0]
    ? book.authors[0].length > 12 ? `${book.authors[0].slice(0, 11)}...` : book.authors[0]
    : '';
  return author ? `${title}\n${author}` : title;
}

function runLayout(cy: cytoscape.Core, duration = 1700, randomize = false) {
  const eles = cy.elements().filter((ele) => {
    if (ele.isNode()) return ele.hasClass('book-node') || ele.hasClass('author-group');
    if (ele.isEdge()) return !ele.hasClass('hidden');
    return false;
  });

  eles.layout({
    name: 'cola',
    animate: true,
    randomize,
    avoidOverlap: true,
    handleDisconnected: true,
    maxSimulationTime: duration,
    nodeSpacing: () => 112,
    edgeLength: () => 250,
    unconstrIter: 30,
    userConstIter: 35,
    allConstIter: 35,
  } as Parameters<typeof cy.layout>[0]).run();
}

function runAuthorLayout(cy: cytoscape.Core, books: Book[]) {
  const authorMap = new Map<string, string[]>();
  const groupedIds = new Set<string>();
  const singles: string[] = [];

  for (const book of books) {
    const author = book.authors?.[0]?.trim();
    if (!author) {
      singles.push(book.id);
      continue;
    }
    if (!authorMap.has(author)) authorMap.set(author, []);
    authorMap.get(author)!.push(book.id);
  }

  const clusters: Array<{ author: string; ids: string[] }> = [];
  authorMap.forEach((ids, author) => {
    if (ids.length >= 2) {
      clusters.push({ author, ids });
      ids.forEach((id) => groupedIds.add(id));
    } else {
      singles.push(...ids);
    }
  });

  const clusterGapX = 360;
  const clusterGapY = 300;
  const itemGapX = 116;
  const itemGapY = 160;
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, clusters.length))));

  cy.batch(() => {
    clusters.forEach((cluster, clusterIndex) => {
      const baseX = (clusterIndex % columns) * clusterGapX;
      const baseY = Math.floor(clusterIndex / columns) * clusterGapY;
      const itemColumns = Math.min(3, Math.ceil(Math.sqrt(cluster.ids.length)));
      const itemRows = Math.ceil(cluster.ids.length / itemColumns);
      const startX = baseX - ((itemColumns - 1) * itemGapX) / 2;
      const startY = baseY - ((itemRows - 1) * itemGapY) / 2 + 18;

      cluster.ids.forEach((bookId, index) => {
        const node = cy.getElementById(bookId);
        if (!node.length) return;
        node.position({
          x: startX + (index % itemColumns) * itemGapX,
          y: startY + Math.floor(index / itemColumns) * itemGapY,
        });
      });
    });

    const singleStartY = Math.ceil(clusters.length / columns) * clusterGapY + 40;
    singles
      .filter((id) => !groupedIds.has(id))
      .forEach((bookId, index) => {
        const node = cy.getElementById(bookId);
        if (!node.length) return;
        node.position({
          x: (index % 5) * itemGapX,
          y: singleStartY + Math.floor(index / 5) * itemGapY,
        });
      });
  });

  cy.fit(cy.nodes().filter((node) => node.hasClass('book-node') || node.hasClass('author-group')), 48);
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
  const groupByAuthorRef = useRef(groupByAuthor);
  const prevGroupByAuthorRef = useRef(groupByAuthor);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    groupByAuthorRef.current = groupByAuthor;
  }, [groupByAuthor]);

  const handleResetZoom = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom(1);
    cy.center();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
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
          selector: 'node.author-group',
          style: {
            'background-color': '#0F172A',
            'background-opacity': 0.9,
            'border-color': '#3B82F6',
            'border-width': 2,
            label: 'data(label)',
            color: '#93C5FD',
            'font-size': 12,
            'font-weight': 700,
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': 8,
            'text-wrap': 'wrap',
            'text-max-width': '220px',
            padding: '32px',
            shape: 'round-rectangle',
            width: 260,
            height: 180,
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
      layout: { name: 'grid' },
    });

    cy.on('zoom', () => setZoom(cy.zoom()));
    cy.on('tap', `node${BOOK_NODE_SELECTOR}`, (event) => onSelectBook(event.target.id()));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [onSelectBook]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    let cancelled = false;
    const existingNodeIds = new Set(cy.nodes(BOOK_NODE_SELECTOR).map((node) => node.id()));
    const newBookIds = new Set(data.books.map((book) => book.id));

    cy.nodes(BOOK_NODE_SELECTOR).forEach((node) => {
      if (!newBookIds.has(node.id())) node.remove();
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
      if (!groupByAuthorRef.current) runLayout(cy, 1700, added.length > 1);
    }

    return () => {
      cancelled = true;
    };
  }, [data.books]);

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
    const cy = cyRef.current;
    if (!cy) return;

    const groupByAuthorChanged = prevGroupByAuthorRef.current !== groupByAuthor;
    prevGroupByAuthorRef.current = groupByAuthor;

    cy.nodes(BOOK_NODE_SELECTOR).move({ parent: null });
    cy.nodes('.author-group').remove();

    if (groupByAuthor) {
      const authorMap = new Map<string, string[]>();
      for (const book of data.books) {
        const author = book.authors?.[0]?.trim();
        if (!author) continue;
        if (!authorMap.has(author)) authorMap.set(author, []);
        authorMap.get(author)!.push(book.id);
      }

      const groupDefs: cytoscape.ElementDefinition[] = [];
      authorMap.forEach((ids, author) => {
        if (ids.length >= 2) {
          groupDefs.push({ data: { id: groupNodeId(author), label: author }, classes: 'author-group' });
        }
      });

      if (groupDefs.length > 0) {
        cy.add(groupDefs);
        authorMap.forEach((ids, author) => {
          if (ids.length < 2) return;
          const parent = groupNodeId(author);
          ids.forEach((bookId) => {
            const node = cy.getElementById(bookId);
            if (node.length) node.move({ parent });
          });
        });
      }

      if (cy.nodes(BOOK_NODE_SELECTOR).length > 0) {
        runAuthorLayout(cy, data.books);
      }
    } else if (groupByAuthorChanged) {
      // groupByAuthor toggled OFF: re-layout from scratch
      if (cy.nodes(BOOK_NODE_SELECTOR).length > 0) {
        runLayout(cy, 1600, true);
      }
    }
    // If groupByAuthor is false and unchanged, the data.books effect handles layout
  }, [groupByAuthor, data.books]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.nodes(BOOK_NODE_SELECTOR).length === 0 || layoutKey === 0) return;
    if (groupByAuthorRef.current) runAuthorLayout(cy, data.books);
    else runLayout(cy, 1800, true);
  }, [layoutKey, data.books]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes(BOOK_NODE_SELECTOR).removeClass('highlighted');
    if (!selectedId) return;

    const node = cy.getElementById(selectedId);
    if (!node.length) return;
    node.addClass('highlighted');
    cy.animate({ center: { eles: node }, duration: 300, easing: 'ease-in-out-cubic' });
  }, [selectedId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focusRequest) return;

    const [bookId] = focusRequest.split('::');
    const node = cy.getElementById(bookId);
    if (!node.length) return;

    cy.zoom(1);
    cy.center(node);
    setZoom(1);
  }, [focusRequest]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="zoom-overlay">
        <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
        <button className="zoom-reset-btn" onClick={handleResetZoom} title="100%に戻す">↺</button>
      </div>
    </div>
  );
}
