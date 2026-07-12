import { useNavigate } from '@tanstack/react-router';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { Building2, CalendarRange, ChevronRight, Folder, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useExpansionState, type UseExpansionState } from '../hooks/use-expansion-state';
import { useHierarchyTree } from '../hooks/use-hierarchy-tree';
import { useNavigatorCrud, type NodeActionTarget } from '../lib/navigator-crud-context';
import { nodeActions } from '../lib/tree-actions';
import { treeKeydown, type NodeKind, type TreeNodeData, type VisibleRow } from '../lib/tree-model';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

/** Long-press duration (ms) that opens the row-actions menu on touch. */
const LONG_PRESS_MS = 500;

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

/** An open row-actions menu: its target node and the viewport point to anchor at. */
interface OpenMenu {
  node: TreeNodeData;
  anchor: { x: number; y: number };
}

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

function targetOf(node: TreeNodeData): NodeActionTarget {
  return { kind: node.kind, id: node.id, name: node.name, parentId: node.parentId };
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
 * windowed.
 *
 * When the CRUD seam ({@link useNavigatorCrud}) reports write access, each row gains a
 * context menu (Phase 2) — a "⋯" button, right-click, and the Menu/Shift+F10 key — that
 * emits create/rename/delete intents to the shell coordinator. `expansion` is supplied
 * by the shell so the coordinator can reveal freshly-created nodes; a standalone tree
 * self-provides it.
 */
export function HierarchyTree({
  orgSlug,
  onNavigate,
  expansion: expansionProp,
}: {
  orgSlug: string;
  onNavigate?: (() => void) | undefined;
  expansion?: UseExpansionState | undefined;
}): React.ReactElement {
  // Self-provide expansion when rendered standalone (tests); the shell passes a shared
  // instance so both rails and the CRUD coordinator agree on what's open.
  const localExpansion = useExpansionState(orgSlug);
  const expansion = expansionProp ?? localExpansion;
  const tree = useHierarchyTree(orgSlug, expansion);
  const { rows, selection } = tree;
  const crud = useNavigatorCrud();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  // The element to refocus when the menu closes — always the target row, so roving
  // tabindex stays coherent after the menu dismisses.
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  // Touch long-press → open the row menu (the large-target, non-hover equivalent of the
  // "⋯" button). `suppressClick` swallows the tap's trailing click so the row doesn't
  // also activate/toggle after the menu opens.
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

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
  // Keep an open-menu row mounted under virtualization, so closing the menu can return
  // focus to it even if it scrolled out of the window.
  const menuIndex = useMemo(
    () => (menu ? rows.findIndex((row) => row.node?.id === menu.node.id) : -1),
    [rows, menu],
  );

  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      // Always keep the focused + selected (+ open-menu) rows mounted, so roving-tabindex
      // focus, deep-link selection, and menu focus-return reach them even when scrolled out.
      const indices = new Set(defaultRangeExtractor(range));
      if (activeIndex >= 0) indices.add(activeIndex);
      if (selectedIndex >= 0) indices.add(selectedIndex);
      if (menuIndex >= 0) indices.add(menuIndex);
      return [...indices].sort((a, b) => a - b);
    },
    [activeIndex, selectedIndex, menuIndex],
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

  // After a confirmed delete the deleted row is gone, so native dialog focus-return
  // would drop to `<body>`. Re-home focus onto the parent row (or the tree container
  // for a deleted root). Only the *visible* rail acts — the off-screen instance's rows
  // have no layout box — so the pinned rail and the drawer don't fight over focus.
  const afterDelete = crud.afterDelete;
  useEffect(() => {
    if (!afterDelete) return;
    const parentRow = afterDelete.parentId ? rowRefs.current.get(afterDelete.parentId) : null;
    const target = parentRow ?? scrollRef.current;
    if (target && target.offsetParent !== null) target.focus();
    // Fire once per delete (keyed on seq); rowRefs/scrollRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterDelete?.seq]);

  const focusRow = (index: number): void => {
    const row = rows[index];
    if (!row) return;
    pendingFocus.current = true;
    setFocusedKey(row.key);
    virtualizer.scrollToIndex(index, { align: 'auto' });
  };

  const openMenu = (node: TreeNodeData, anchor: { x: number; y: number }): void => {
    menuTriggerRef.current = rowRefs.current.get(node.id) ?? null;
    setMenu({ node, anchor });
  };

  const cancelLongPress = (): void => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Start a touch long-press that opens the row menu; a move/lift/scroll cancels it.
  const startLongPress = (node: TreeNodeData, x: number, y: number): void => {
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      suppressClick.current = true;
      openMenu(node, { x, y });
    }, LONG_PRESS_MS);
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
    // The context-menu key (and Shift+F10) opens the row-actions menu for writers.
    if (
      crud.canWrite &&
      row.node &&
      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
    ) {
      event.preventDefault();
      const element = rowRefs.current.get(row.key);
      const rect = element?.getBoundingClientRect();
      openMenu(row.node, { x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
      return;
    }
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
          const menuOpenHere = menu?.node.id === node.id;
          const Icon = KIND_ICON[node.kind];
          const showActions = crud.canWrite;

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
              onClick={() => {
                // Swallow the trailing click from a long-press that already opened the menu.
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                activate(row);
              }}
              onFocus={() => setFocusedKey(row.key)}
              onContextMenu={
                showActions
                  ? (event) => {
                      event.preventDefault();
                      openMenu(node, { x: event.clientX, y: event.clientY });
                    }
                  : undefined
              }
              onPointerDown={
                showActions
                  ? (event) => {
                      // Touch long-press is the large-target, non-hover way to open the menu.
                      if (event.pointerType === 'touch')
                        startLongPress(node, event.clientX, event.clientY);
                    }
                  : undefined
              }
              onPointerUp={showActions ? cancelLongPress : undefined}
              onPointerMove={showActions ? cancelLongPress : undefined}
              onPointerCancel={showActions ? cancelLongPress : undefined}
              className={cn(
                'focus-visible:ring-sidebar-ring group flex cursor-pointer items-center gap-1.5 pr-1 text-sm outline-none focus-visible:ring-2',
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
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {showActions ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  // Not a tab stop: the tree is a single tab stop (roving); keyboard users
                  // open the same menu with the Menu/Shift+F10 key on the focused row.
                  tabIndex={-1}
                  aria-label={`Actions for ${node.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpenHere}
                  onClick={(event) => {
                    // Don't let the row's activate/toggle fire.
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openMenu(node, { x: rect.left, y: rect.bottom });
                  }}
                  className={cn(
                    'shrink-0',
                    // Reveal on hover/focus for fine pointers; stay visible on touch (coarse
                    // pointers have no hover) so the affordance always has a non-hover path.
                    'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
                    'focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100',
                    menuOpenHere && 'opacity-100',
                  )}
                >
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {menu ? (
        <Menu
          open
          onClose={() => setMenu(null)}
          anchor={menu.anchor}
          label={`Actions for ${menu.node.name}`}
          restoreFocusRef={menuTriggerRef}
        >
          {nodeActions(menu.node.kind, crud.canWrite).map((action) => (
            <MenuItem
              key={action.kind}
              destructive={action.destructive ?? false}
              onSelect={() => crud.onNodeAction(action.kind, targetOf(menu.node))}
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </div>
  );
}
