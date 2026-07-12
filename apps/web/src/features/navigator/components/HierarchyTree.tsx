import { useNavigate } from '@tanstack/react-router';
import { Building2, CalendarRange, ChevronRight, Folder } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { useHierarchyTree } from '../hooks/use-hierarchy-tree';
import { treeKeydown, type NodeKind, type VisibleRow } from '../lib/tree-model';

import { cn } from '@/lib/utils';

const KIND_ICON: Record<NodeKind, typeof Building2> = {
  client: Building2,
  project: Folder,
  plan: CalendarRange,
};

const STATE_LABEL: Record<'loading' | 'empty' | 'error', string> = {
  loading: 'Loading…',
  empty: 'Nothing here yet',
  error: 'Couldn’t load',
};

/** Root-level empty copy is friendlier than a bare "Nothing here yet". */
function emptyLabel(row: VisibleRow): string {
  if (row.type !== 'empty') return STATE_LABEL[row.type as 'loading' | 'error'];
  if (row.parentId === null) return 'No clients yet';
  return 'Empty';
}

/**
 * The **Project Explorer** tree (ADR-0029): an accessible ARIA `tree` over the
 * flattened visible rows from {@link useHierarchyTree}. A single tab stop with
 * roving `tabindex`; the WAI-ARIA APG keymap (↑/↓, ←/→ expand-collapse-or-move,
 * Home/End, Enter/Space) drives it. Per the product-owner decision, **folders
 * (client/project) only expand**; only a **plan** leaf navigates (updating the URL,
 * the source of truth) and loads onto the canvas. Navigation-only — no in-tree CRUD.
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
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // The single tab stop: the focused row, else the selected row, else the first row.
  const selectedKey = useMemo(
    () => (selection ? (rows.find((row) => row.node?.id === selection.id)?.key ?? null) : null),
    [rows, selection],
  );
  const activeKey = focusedKey ?? selectedKey ?? rows[0]?.key ?? null;

  const focusRow = (key: string): void => {
    setFocusedKey(key);
    rowRefs.current.get(key)?.focus();
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
    const index = rows.findIndex((row) => row.key === activeKey);
    if (index < 0) return;
    const row = rows[index]!;
    const intent = treeKeydown(event.key, { expandable: row.expandable, expanded: row.expanded });
    if (!intent) return;
    event.preventDefault();
    switch (intent) {
      case 'next':
        focusRow(rows[Math.min(index + 1, rows.length - 1)]!.key);
        break;
      case 'prev':
        focusRow(rows[Math.max(index - 1, 0)]!.key);
        break;
      case 'first':
        focusRow(rows[0]!.key);
        break;
      case 'last':
        focusRow(rows[rows.length - 1]!.key);
        break;
      case 'firstChild':
        focusRow(rows[Math.min(index + 1, rows.length - 1)]!.key);
        break;
      case 'expand':
        if (row.node) tree.expand(row.node.id);
        break;
      case 'collapse':
        if (row.node) tree.collapse(row.node.id);
        break;
      case 'toParent': {
        const parent = rows.find((candidate) => candidate.node?.id === row.parentId);
        if (parent) focusRow(parent.key);
        break;
      }
      case 'activate':
        activate(row);
        break;
    }
  };

  return (
    // A tree is a composite widget: focus lives on the treeitems via roving tabindex,
    // so the container itself is intentionally not a tab stop.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div role="tree" aria-label="Project Explorer" onKeyDown={onKeyDown} className="py-1">
      {rows.map((row) => {
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
                'text-muted-foreground flex items-center gap-1.5 py-1 pr-2 text-sm italic outline-none',
                row.type === 'error' && 'text-destructive-text',
              )}
              style={{ paddingLeft: `${row.level * 16}px` }}
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
              'focus-visible:ring-sidebar-ring flex cursor-pointer items-center gap-1.5 py-1 pr-2 text-sm outline-none focus-visible:ring-2',
              isSelected
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'hover:bg-sidebar-accent/50',
            )}
            style={{ paddingLeft: `${row.level * 16}px` }}
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
  );
}
