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
  onNodeMenu: (id: string, x: number, y: number) => void;
  layoutKey: number;
}

function coverForBook(book: Book): string | undefined {
  if (book.coverUrl?.startsWith('https://cover.openbd.jp/')) {
    return book.coverUrl.replace('https://cover.openbd.jp', '/api/openbd-cover');
  }
  if (book.coverUrl?.startsWith('https://books.google.com')) {
    return book.coverUrl.replace('https://books.google.com', '/api/google-cover');
  }
  if (book.coverUrl?.startsWith('https://thumbnail-s.images.books.or.jp/')) {
    return book.coverUrl.replace('https://thumbnail-s.images.books.or.jp', '/api/books-cover');
  }
  if (book.coverUrl) return book.coverUrl;
  const isbn = book.isbn?.replace(/[-\s]/g, '');
  return isbn ? `/api/books-cover/${isbn}.jpg` : generatedCoverForBook(book);
}

function generatedCoverForBook(book: Book): string {
  const t = book.title;
  const line1 = t.slice(0, 7);
  const line2 = t.length > 7 ? t.slice(7, 13) + (t.length > 13 ? '…' : '') : '';
  const y1 = line2 ? 38 : 48;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="96" viewBox="0 0 68 96">
    <rect width="68" height="96" rx="4" fill="#1e3a5f"/>
    <rect x="2" y="2" width="64" height="92" rx="3" fill="none" stroke="#60a5fa" stroke-width="1" opacity=".6"/>
    <text x="34" y="${y1}" fill="#f8fafc" font-family="sans-serif" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(line1)}</text>
    ${line2 ? `<text x="34" y="${y1 + 14}" fill="#f8fafc" font-family="sans-serif" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(line2)}</text>` : ''}
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

function nodeAuthorLabel(author?: string): string {
  if (!author) return '';
  return author.length > 14 ? `${author.slice(0, 12)}…` : author;
}

export function BookGraph({ data, enabledTypes, selectedId, onSelectBook, onNodeMenu, layoutKey }: Props) {
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
            color: '#94A3B8',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 3,
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            width: 68,
            height: 96,
            shape: 'round-rectangle',
            'background-opacity': 1,
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

    cy.on('tap', 'node', (e) => {
      const id = e.target.id();
      const pos = e.target.renderedPosition();
      onSelectBook(id);
      onNodeMenu(id, pos.x, pos.y);
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

    const existingNodeIds = new Set(cy.nodes().map((n) => n.id()));
    const newBookIds = new Set(data.books.map((b) => b.id));

    // Remove deleted nodes
    cy.nodes().forEach((n) => {
      if (!newBookIds.has(n.id())) n.remove();
    });

    // Add new nodes
    const added: cytoscape.ElementDefinition[] = [];
    for (const book of data.books) {
      const cover = coverForBook(book);
      if (existingNodeIds.has(book.id)) {
        const node = cy.getElementById(book.id);
        node.data('label', nodeAuthorLabel(book.authors?.[0]));
        node.data('read', book.read ?? false);
        if (cover) node.data('cover', cover);
        else node.removeData('cover');
      } else {
        added.push({
          data: {
            id: book.id,
            label: nodeAuthorLabel(book.authors?.[0]),
            read: book.read ?? false,
            ...(cover ? { cover } : {}),
          },
        });
      }
    }

    if (added.length > 0) {
      cy.add(added);
      cy.layout({
        name: 'cola',
        animate: true,
        randomize: false,
        maxSimulationTime: 1500,
      } as Parameters<typeof cy.layout>[0]).run();
    }
  }, [data.books]);

  // Sync edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));
    const newRelIds = new Set(data.relationships.map((r) => r.id));

    // Remove deleted edges
    cy.edges().forEach((e) => {
      if (!newRelIds.has(e.id())) e.remove();
    });

    // Add new edges, respecting filter
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

    // Toggle visibility based on enabled types
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
    if (!cy || cy.nodes().length === 0 || layoutKey === 0) return;
    cy.elements('node, edge:not(.hidden)').layout({
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
    cy.nodes().removeClass('highlighted');
    if (selectedId) {
      cy.getElementById(selectedId).addClass('highlighted');
    }
  }, [selectedId]);

  return <div ref={containerRef} className="graph-canvas" />;
}
