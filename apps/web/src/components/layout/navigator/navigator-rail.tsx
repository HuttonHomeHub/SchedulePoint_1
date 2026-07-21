import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { SheetHeader } from '@/components/ui/sheet';
import { HierarchyTree, useNavigatorCrud, type UseExpansionState } from '@/features/navigator';
import { AppVersionLine } from '@/features/system';

/**
 * The **Project Explorer** rail — the persistent home of the Client → Project → Plan
 * tree (ADR-0029). Rendered once in {@link AppShell} (the pinned rail on `lg`+ and the
 * drawer below `lg`), so it survives route changes. When an org is active it hosts the
 * accessible {@link HierarchyTree}; otherwise a brief hint.
 *
 * `onCollapse` (pinned rail) and `onClose` (drawer) are mutually exclusive header
 * affordances — pass whichever fits the surface. `focusToggleOnMount` moves focus to
 * the header control when the rail (re)mounts after a user toggle, so keyboard/AT
 * users don't lose their place on collapse/expand. `onNavigate` fires when a plan is
 * opened (the drawer uses it to close).
 */
export function NavigatorRail({
  orgSlug,
  expansion,
  onCollapse,
  onClose,
  onNavigate,
  focusToggleOnMount,
}: {
  orgSlug?: string | undefined;
  expansion?: UseExpansionState | undefined;
  onCollapse?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onNavigate?: (() => void) | undefined;
  focusToggleOnMount?: boolean | undefined;
}): React.ReactElement {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const crud = useNavigatorCrud();
  useEffect(() => {
    if (focusToggleOnMount) toggleRef.current?.focus();
  }, [focusToggleOnMount]);

  return (
    <nav
      aria-label="Project Explorer"
      className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full min-h-0 flex-col border-r"
    >
      {/* Shared drawer header chrome ({@link SheetHeader}) — class overrides keep this rail's exact look
          (sidebar border, fixed h-12/no padding, semibold title, gap-1, size-`icon` buttons). The
          rail's extra controls (New client / Collapse) ride the `actions` slot; the Close button is the
          SheetHeader's own. */}
      <SheetHeader
        title="Project Explorer"
        className="border-sidebar-border h-12 shrink-0 gap-1 px-4 py-0"
        titleClassName="font-semibold tracking-tight"
        actionsClassName="gap-1"
        actions={
          <>
            {/* Root create (CQ-2): an empty org has no node to right-click, so writers get
                a "New client" entry point here; hidden for non-writers and flag-off. */}
            {orgSlug && crud.canWrite ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="New client"
                onClick={crud.onCreateClient}
              >
                <Plus aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
            {onCollapse ? (
              <Button
                ref={toggleRef}
                variant="ghost"
                size="icon"
                aria-label="Collapse Project Explorer"
                onClick={onCollapse}
              >
                <PanelLeftClose aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        }
        {...(onClose
          ? {
              onClose,
              closeLabel: 'Close Project Explorer',
              closeButtonSize: 'icon' as const,
            }
          : {})}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {orgSlug ? (
          <HierarchyTree orgSlug={orgSlug} expansion={expansion} onNavigate={onNavigate} />
        ) : (
          <p className="text-muted-foreground p-4 text-sm">Select an organisation to browse.</p>
        )}
      </div>
      {/* A quiet footer with both service versions — subtle build metadata, not a nav item. */}
      <div className="border-sidebar-border shrink-0 border-t px-4 py-2">
        <AppVersionLine />
      </div>
    </nav>
  );
}

/**
 * The collapsed pinned rail: a slim bar with a single control to reopen it. Keeps a
 * persistent affordance on screen so the explorer is never more than one click away.
 */
export function NavigatorRailCollapsed({
  onExpand,
  focusToggleOnMount,
}: {
  onExpand: () => void;
  focusToggleOnMount?: boolean;
}): React.ReactElement {
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusToggleOnMount) toggleRef.current?.focus();
  }, [focusToggleOnMount]);

  return (
    <div className="bg-sidebar border-sidebar-border flex h-full flex-col items-center border-r py-2">
      <Button
        ref={toggleRef}
        variant="ghost"
        size="icon"
        aria-label="Show Project Explorer"
        onClick={onExpand}
      >
        <PanelLeftOpen aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
