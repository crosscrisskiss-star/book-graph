import { useEffect, useRef } from 'react';
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
}

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
  const t = book.title;
  const lines: string[] = [];
  for (let i = 0; i < t.length && lines.length < 3; i += 6) {
    const chunk = t.slice(i, i + 6);
    lines.push(i + 6 < t.length && lines.length === 2 ? chunk.slice(0, 5) + '…' : chunk);
  }
  const lineH = 16;
  const totalH = lines.length * lineH;
  const startY = (96 - totalH) / 2 + 8;
  const textEls = lines
    .map((l, i) => `<text x="34" y="${startY + i * lineH}" fill="#f8fafc" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="96" viewBox="0 0 68 96">
    <rect width="68" height="96" rx="4" fill="#1e3a5f"/>
    <rect x="2" y="2" width="64" height="92" rx="3" fill="none" stroke="#60a5fa" stroke-width="1" opacity=".5"/>
    ${textEls}
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

function nodeTitle(title?: string): string {
  return title ?? '';
}

function nodeAuthor(author?: string): string {
  if (!author) return '';
  return author.length > 14 ? `${author.slice(0, 12)}…` : author;
}

function phantomId(bookId: string): string {
  return `${bookId}::a`;
}

function calcPhantomY(title: string): number {
  // 110px wide, font-size 10, Japanese chars ~10px wide → ~11 chars/line, line-height ~14px
  const lines = Math.max(1, Math.ceil(title.length / 11));
  return 51 + lines * 14 + 8; // node-bottom(48) + margin(3) + text + gap(8)
}

function syncPhantom(cy: cytoscape.Core, bookId: string) {
  const main = cy.getElementById(bookId);
  const phantom = cy.getElementById(phantomId(bookId));
  if (main.length && phantom.length) {
    const pos = main.position();
    const offset: number = main.data('phantomY') ?? 80;
    phantom.position({ x: pos.x, y: pos.y + offset });
  }
}

export function BookGraph({ data, enabledTypes, selectedId, onSelectBook, layoutKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#1E293B',
            'border-width': 2,
            'border-color': '#475569',
            label: 'data(label)',
            color: '#F1F5F9',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 3,
            'text-wrap': 'wrap',
            'text-max-width': '110px',
            width: 68,
            height: 96,
            shape: 'round-rectangle',
            'background-opacity': 1,
          },
        },
        {
          selector: 'node.author-phantom',
          style: {
            'background-opacity': 0,
            'border-width': 0,
            width: 1,
            height: 1,
            label: 'data(label)',
            color: '#94A3B8',
            'font-size': 10,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '90px',
            events: 'no',
          },
        },
        {
          selector: 'node[cover]',
          style: {
            'background-image': 'data(cover)',
            'background-fit': 'cover',
            'background-clip': 'node',
            'background-position-x': '50%',
            'background-position-y': '50%',
            'background-width': '100%',
            'background-height': '100%',
          },
        },
        {
          selector: 'node[?read]',
          style: {
            'border-color': '#22C55E',
            'border-width': 2,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#F59E0B',
            'border-width': 3,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#F59E0B',
            'border-width': 3,
          },
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

    cy.on('tap', 'node:not(.author-phantom)', (e) => {
      onSelectBook(e.target.id());
    });

    cy.on('layoutstop', () => {
      cy.nodes(':not(.author-phantom)').forEach((n) => syncPhantom(cy, n.id()));
    });

    cy.on('drag', 'node:not(.author-phantom)', (e) => {
      syncPhantom(cy, e.target.id());
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    let cancelled = false;

    const existingNodeIds = new Set(cy.nodes(':not(.author-phantom)').map((n) => n.id()));
    const newBookIds = new Set(data.books.map((b) => b.id));

    // Remove deleted nodes + their phantoms
    cy.nodes(':not(.author-phantom)').forEach((n) => {
      if (!newBookIds.has(n.id())) {
        cy.getElementById(phantomId(n.id())).remove();
        n.remove();
      }
    });

    function asyncLoadCover(bookId: string, proxyUrl: string, fallback: string) {
      const cyInst = cy!;
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

    // Add/update nodes
    const added: cytoscape.ElementDefinition[] = [];
    for (const book of data.books) {
      const generated = generatedCoverForBook(book);
      const proxyUrl = coverForBook(book);
      const isDataUri = proxyUrl.startsWith('data:');

      const py = calcPhantomY(book.title);
      if (existingNodeIds.has(book.id)) {
        const node = cy.getElementById(book.id);
        node.data('label', nodeTitle(book.title));
        node.data('read', book.read ?? false);
        node.data('phantomY', py);
        cy.getElementById(phantomId(book.id)).data('label', nodeAuthor(book.authors?.[0]));
        if (!isDataUri) asyncLoadCover(book.id, proxyUrl, generated);
      } else {
        added.push({
          data: { id: book.id, label: nodeTitle(book.title), read: book.read ?? false, cover: generated, phantomY: py },
        });
        added.push({
          data: { id: phantomId(book.id), label: nodeAuthor(book.authors?.[0]) },
          classes: 'author-phantom',
        });
        if (!isDataUri) asyncLoadCover(book.id, proxyUrl, generated);
      }
    }

    if (added.length > 0) {
      cy.add(added);
      cy.elements('node:not(.author-phantom), edge:not(.hidden)').layout({
        name: 'cola',
        animate: true,
        randomize: false,
        maxSimulationTime: 1500,
      } as Parameters<typeof cy.layout>[0]).run();
    }

    return () => { cancelled = true; };
  }, [data.books]);

  // Sync edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));
    const newRelIds = new Set(data.relationships.map((r) => r.id));

    cy.edges().forEach((e) => {
      if (!newRelIds.has(e.id())) e.remove();
    });

    for (const rel of data.relationships) {
      if (!existingEdgeIds.has(rel.id)) {
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
    }

    cy.edges().forEach((e) => {
      const relType = data.relationships.find((r) => r.id === e.id())?.type;
      if (relType && !enabledTypes.has(relType)) {
        e.addClass('hidden');
      } else {
        e.removeClass('hidden');
      }
    });
  }, [data.relationships, enabledTypes]);

  // Re-layout triggered by layoutKey
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.nodes(':not(.author-phantom)').length === 0 || layoutKey === 0) return;
    cy.elements('node:not(.author-phantom), edge:not(.hidden)').layout({
      name: 'cola',
      animate: true,
      randomize: false,
      maxSimulationTime: 2500,
    } as Parameters<typeof cy.layout>[0]).run();
  }, [layoutKey]);

  // Highlight selected
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes(':not(.author-phantom)').removeClass('highlighted');
    if (selectedId) {
      cy.getElementById(selectedId).addClass('highlighted');
    }
  }, [selectedId]);

  return <div ref={containerRef} className="graph-canvas" />;
}
