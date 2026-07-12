import { useNavigate } from '@tanstack/react-router';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { Building2, CalendarRange, ChevronRight, Folder } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useHierarchyTree } from '../hooks/use-hierarchy-tree';
import { treeKeydown, type NodeKind, type VisibleRow } from '../lib/tree-model';

import { cn } from '@/lib/utils';

const KIND_ICON: Record<NodeKind, typeof Building2> = {
  client: Building2,
  project: Folder,
  plan: CalendarRange,
};

/** Fixed row height (px) — rows are single-line, so no per-item measurement is needed. */
const ROW_HEIGHT = 28;

const STATE_LABEL: Record<'loading' | 'error', string> = {
  loading: 'Loading…',
  error: 'Couldn’t load',
};

/**
 * Per-level empty copy (kept deliberately distinct from the pages' own "No … yet"
 * empty states so nothing double-matches in tests/AT).
 */
function emptyLabel(row: VisibleRow): string {
  if (row.type !== 'empty') return STATE_LABEL[row.type as 'loading' | 'error'];
  if (row.level <= 1) return 'No clients';
  if (row.level === 2) return 'No projects';
  return 'No plans';
}

/** Absolute position + indentation for a virtualized row. */
function rowStyle(top: number, level: number): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: ROW_HEIGHT,
    transform: `translateY(${top}px)`,
    paddingLeft: level * 16,
  };
}

/**
 * The **Project Explorer** tree (ADR-0029): an accessible ARIA `tree` over the
 * flattened visible rows from {@link useHierarchyTree}, **virtualized** so it stays
 * cheap at org scale. A single tab stop with roving `tabindex`; the WAI-ARIA APG
 * keymap (↑/↓, ←/→ expand-collapse-or-move, Home/End, Enter/Space) drives it. Per the
 * product-owner decision, **folders (client/project) only expand**; only a **plan**
 * leaf navigates (updating the URL, the source of truth) and loads onto the canvas.
 * ARIA `setsize`/`posinset` come from the full model, and the focused/selected node is
 * always force-rendered, so keyboard nav and deep-links reach any item even when
 * windowed. Navigation-only — no in-tree CRUD.
 */
export function HierarchyTree({
  orgSlug,
  onNavigate,
}: {
  orgSlug: string;
  onNavigate?: (() => void) | undefined;
}): React.ReactElement {
  const tree = useHierarchyTree(orgSlug);
  const { rows, selection } = tree;
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const selectedIndex = useMemo(
    () => (selection ? rows.findIndex((row) => row.node?.id === selection.id) : -1),
    [rows, selection],
  );
  // The single tab stop: the focused row, else the selected row, else the first row.
  const activeKey =
    focusedKey ?? (selectedIndex >= 0 ? rows[selectedIndex]!.key : null) ?? rows[0]?.key ?? null;
  const activeIndex = useMemo(
    () => rows.findIndex((row) => row.key === activeKey),
    [rows, activeKey],
  );

  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      // Always keep the focused + selected rows mounted, so roving-tabindex focus and
      // deep-link selection reach them even when scrolled out of the window.
      const indices = new Set(defaultRangeExtractor(range));
      if (activeIndex >= 0) indices.add(activeIndex);
      if (selectedIndex >= 0) indices.add(selectedIndex);
      return [...indices].sort((a, b) => a - b);
    },
    [activeIndex, selectedIndex],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 320, height: 600 },
    rangeExtractor,
  });

  // Focus the acting row only right after a keyboard move set it (never on background
  // data loads, which would steal focus back into the tree).
  useEffect(() => {
    if (pendingFocus.current && focusedKey) {
      rowRefs.current.get(focusedKey)?.focus();
      pendingFocus.current = false;
    }
  }, [focusedKey]);

  const focusRow = (index: number): void => {
    const row = rows[index];
    if (!row) return;
    pendingFocus.current = true;
    setFocusedKey(row.key);
    virtualizer.scrollToIndex(index, { align: 'auto' });
  };

  const activate = (row: VisibleRow): void => {
    if (!row.node) return;
    if (row.node.kind === 'plan') {
      void navigate({
        to: '/orgs/$orgSlug/plans/$planId',
        params: { orgSlug, planId: row.node.id },
      });
      onNavigate?.();
    } else {
      tree.toggle(row.node.id);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (activeIndex < 0) return;
    const row = rows[activeIndex]!;
    const intent = treeKeydown(event.key, { expandable: row.expandable, expanded: row.expanded });
    if (!intent) return;
    event.preventDefault();
    switch (intent) {
      case 'next':
        focusRow(Math.min(activeIndex + 1, rows.length - 1));
        break;
      case 'prev':
        focusRow(Math.max(activeIndex - 1, 0));
        break;
      case 'first':
        focusRow(0);
        break;
      case 'last':
        focusRow(rows.length - 1);
        break;
      case 'firstChild':
        focusRow(Math.min(activeIndex + 1, rows.length - 1));
        break;
      case 'expand':
        if (row.node) tree.expand(row.node.id);
        break;
      case 'collapse':
        if (row.node) tree.collapse(row.node.id);
        break;
      case 'toParent': {
        const parentIndex = rows.findIndex((candidate) => candidate.node?.id === row.parentId);
        if (parentIndex >= 0) focusRow(parentIndex);
        break;
      }
      case 'activate':
        activate(row);
        break;
    }
  };

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label="Project Explorer"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="h-full overflow-y-auto py-1 outline-none"
    >
      <div role="presentation" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]!;
          const isActive = row.key === activeKey;
          const registerRef = (element: HTMLDivElement | null): void => {
            if (element) rowRefs.current.set(row.key, element);
            else rowRefs.current.delete(row.key);
          };

          if (row.type !== 'node' || !row.node) {
            return (
              <div
                key={row.key}
                ref={registerRef}
                role="treeitem"
                aria-level={row.level}
                aria-setsize={row.setSize}
                aria-posinset={row.posInSet}
                aria-selected={false}
                aria-disabled="true"
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'flex items-center gap-1.5 pr-2 text-sm italic outline-none',
                  row.type === 'error' ? 'text-destructive-text' : 'text-muted-foreground',
                )}
                style={rowStyle(item.start, row.level)}
              >
                {emptyLabel(row)}
              </div>
            );
          }

          const node = row.node;
          const isSelected = selection?.id === node.id;
          const Icon = KIND_ICON[node.kind];

          return (
            // Keyboard is handled by the tree's roving keydown handler (delegated), not
            // per-row, so the click handler intentionally has no local key listener.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={row.key}
              ref={registerRef}
              role="treeitem"
              aria-level={row.level}
              aria-setsize={row.setSize}
              aria-posinset={row.posInSet}
              aria-expanded={row.expandable ? row.expanded : undefined}
              aria-selected={isSelected}
              {...(isSelected ? { 'aria-current': 'true' as const } : {})}
              tabIndex={isActive ? 0 : -1}
              onClick={() => activate(row)}
              onFocus={() => setFocusedKey(row.key)}
              className={cn(
                'focus-visible:ring-sidebar-ring flex cursor-pointer items-center gap-1.5 pr-2 text-sm outline-none focus-visible:ring-2',
                isSelected
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'hover:bg-sidebar-accent/50',
              )}
              style={rowStyle(item.start, row.level)}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'size-4 shrink-0 transition-transform',
                  !row.expandable && 'invisible',
                  row.expanded && 'rotate-90',
                )}
              />
              <Icon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
              <span className="truncate">{node.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
