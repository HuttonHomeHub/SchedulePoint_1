import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail, NavigatorRailCollapsed } from './navigator-rail';
import { RailResizer } from './rail-resizer';
import { ShellContext } from './shell-context';
import { useRailPrefs } from './use-rail-prefs';

import { ChromeBandRow, ChromeSlotHost } from '@/components/layout/chrome/chrome-band';
import { AnnouncerProvider, useAnnounce } from '@/components/ui/announcer';
import { Sheet } from '@/components/ui/sheet';
import { Surface } from '@/components/ui/surface';
import { useExpansionState } from '@/features/navigator';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** `lg` breakpoint (64rem) as a media query — the pinned rail takes over at/above it. */
const LG_QUERY = '(min-width: 64rem)';

/**
 * The persistent app-shell (ADR-0029): a top bar + Project Explorer rail + a single
 * workspace region that stay **mounted once**, so navigating between plans swaps only
 * the `<Outlet/>` and the rail keeps its state and warm cache. On `lg`+ the rail is
 * pinned (collapsible + resizable); below `lg` it is an off-canvas drawer opened from
 * the header. **Unconditional** since `VITE_NAV_TREE` retired (2026-08-18): {@link AuthedLayout}
 * is now this component and nothing else.
 */
export function AppShell(): React.ReactElement {
  return (
    <AnnouncerProvider>
      <ShellFrame />
    </AnnouncerProvider>
  );
}

/** Inner frame — inside {@link AnnouncerProvider} so it can announce layout changes. */
function ShellFrame(): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Only steal focus onto the (re)mounted rail toggle after a *user* collapse/expand,
  // never on first paint.
  const [interacted, setInteracted] = useState(false);
  const rail = useRailPrefs();
  const announce = useAnnounce();
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;

  // Shared, per-org expansion (ADR-0029 Phase 2): both rails and the CRUD coordinator
  // read one set, so revealing a freshly-created node works and pinned/drawer agree.
  const expansion = useExpansionState(orgSlug ?? '');
  // In-tree CRUD is write-RBAC only now that `VITE_NAV_TREE_CRUD` has retired (ADR-0084 batch 1):
  // Contributors/Viewers keep a read-only tree. The API re-checks; this is UX only.
  const role = useOrgRole(orgSlug ?? '');
  const canWrite = canManageHierarchy(role);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const shell = useMemo(() => ({ openDrawer }), [openDrawer]);

  const collapse = useCallback(() => {
    setInteracted(true);
    rail.collapse();
    announce('Project Explorer collapsed.');
  }, [rail, announce]);

  const expand = useCallback(() => {
    setInteracted(true);
    rail.expand();
    announce('Project Explorer expanded.');
  }, [rail, announce]);

  // Close the drawer once the viewport reaches `lg`+, where the pinned rail is shown — otherwise a
  // modal drawer lingers behind it (duplicate landmark + stuck focus trap). This is a *transition
  // side-effect* (close on a breakpoint crossing), not a render value, so a `matchMedia` change
  // listener is the right tool here — the shared `useMediaQuery` hook returns a render boolean and
  // would push the close into a setState-in-effect (TECH_DEBT #30a: intentionally left as-is).
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(LG_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) setDrawerOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <ShellContext.Provider value={shell}>
      <NavigatorCrud orgSlug={orgSlug} canWrite={canWrite} expansion={expansion}>
        <ChromeSlotHost>
          {({ rowsSlotRef, identitySlotRef }) => (
            <>
              {/* **The shell is ONE grid** (Graphite M2). It replaces nested flex columns, and the
                  reason is §4a: the command band spans the columns the drawer sits inside, so
                  opening a drawer redistributes width between the stage and the drawer and changes
                  the band by ZERO. No ResizeObserver, no measurement, and no way to break it
                  without changing `grid-column` — which is what four epics of measuring a row
                  against its own leftover width bought.

                  Rows 1 and 3 are `auto`, so an unfilled band or status bar is a zero-height row
                  and every screen that is not a plan keeps the frame it has. That is the
                  content-driven-height argument the chrome band already made, preserved.

                  `h-dvh`, NOT `min-h-dvh`. A minimum leaves this box's height `auto`, so every
                  `min-h-0` descendant resolves against content instead of the viewport and the
                  workspace region silently becomes unbounded. The canvas could never reveal that —
                  it sizes itself from a ResizeObserver and fills whatever it is given — but the
                  Gantt's virtualizer measured its scroller, found it as tall as its own content,
                  and rendered every row (ADR-0059 §1's premise, falsified by a layout bug rather
                  than by the substrate choice). The shell is therefore exactly the viewport and
                  `<main>` scrolls, rather than the document scrolling. */}
              <div className="grid h-dvh grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
                {/* Row 1 — the command band. It spans every column TODAY because the header is
                    full-width; Graphite M5 narrows the span to the stage + drawer once the rail
                    becomes the leading column. */}
                <ChromeBandRow
                  rowsSlotRef={rowsSlotRef}
                  identitySlotRef={identitySlotRef}
                  className="col-span-3 col-start-1 row-start-1"
                />

                {/* Row 2, column 1 — the Project Explorer. Still the leading column, still
                    resizable, still collapsing to an icon strip. Graphite M3 replaces its contents
                    with the tool rail and moves the tree into the drawer; nothing about its
                    placement changes. */}
                {rail.collapsed ? (
                  <div className="col-start-1 row-start-2 hidden shrink-0 lg:block">
                    <NavigatorRailCollapsed
                      onExpand={expand}
                      focusToggleOnMount={interacted}
                      orgSlug={orgSlug}
                    />
                  </div>
                ) : (
                  <div className="col-start-1 row-start-2 hidden min-h-0 shrink-0 lg:flex">
                    <div className="min-h-0" style={{ width: rail.width }}>
                      <NavigatorRail
                        orgSlug={orgSlug}
                        expansion={expansion}
                        onCollapse={collapse}
                        focusToggleOnMount={interacted}
                      />
                    </div>
                    {/* The resizer sits between the rail and `<main>`, but it is rail chrome, so it
                        takes the rail's colours. `contents` keeps the scope purely a colour
                        context — custom properties still inherit, and no box is added. */}
                    <Surface tone="panel" className="contents">
                      <RailResizer width={rail.width} onResize={rail.setWidth} />
                    </Surface>
                  </div>
                )}

                {/* Row 2, column 2 — the one `<main>` for the page. `min-h-0` lets it shrink to the
                    shell; `overflow-auto` gives screens taller than the viewport somewhere to go,
                    so the band and the rail stay put while the content moves. */}
                <main className="col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-auto">
                  <Outlet />
                </main>

                {/* Row 2, column 3 — the context drawer's cell, empty until Graphite M4. An `auto`
                    column with no child is zero wide, so today's layout is unchanged. */}
              </div>

              {/* Below lg: the rail as an off-canvas drawer. */}
              <Sheet open={drawerOpen} onClose={closeDrawer} title="Project Explorer">
                <NavigatorRail
                  orgSlug={orgSlug}
                  expansion={expansion}
                  onClose={closeDrawer}
                  onNavigate={closeDrawer}
                />
              </Sheet>
            </>
          )}
        </ChromeSlotHost>
      </NavigatorCrud>
    </ShellContext.Provider>
  );
}
