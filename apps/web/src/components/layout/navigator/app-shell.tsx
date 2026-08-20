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
          {({ rowsSlotRef }) => (
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
              <div className="relative grid h-dvh grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
                {/* **The skip link** — the first focusable thing in the document, and the only
                    one there is (`apps/web/src` had none at all before Graphite M3, plan.md §A4).
                    It became load-bearing when the rail took the leading column top to bottom: a
                    keyboard user now tabs brand → switcher → the New-client and collapse controls →
                    a `tree` of however many clients, projects and plans the organisation has → six
                    destinations → the account menu, before reaching any of the thirteen routes'
                    content. That is WCAG 2.4.1 Bypass Blocks.

                    `sr-only focus:not-sr-only` rather than an off-screen box that animates in: it
                    must be reachable, not decorative, and `not-sr-only` restores a real box the
                    moment it takes focus. Absolutely positioned so revealing it cannot reflow the
                    grid under the reader's cursor. */}
                <a
                  href="#main"
                  className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only absolute top-2 left-2 z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus-visible:ring-2 focus-visible:outline-none"
                >
                  Skip to main content
                </a>

                {/* Column 1 — the rail, spanning EVERY row (Graphite M3). It is the leading edge
                    top to bottom, which is what deleting the top bar buys: the brand, the
                    organisation switcher and the account menu move into it, and the ~56 px the bar
                    held goes back to the stage.

                    It comes BEFORE the band in the DOM, and that is reading order rather than a
                    preference: the rail's top-left corner is the document's, and the band starts
                    46 px in. plan.md §A4's rule is that DOM order IS visual order — never `order:`,
                    `row-reverse` or `direction: rtl`, each of which decouples focus from reading.
                    The cost is the tab traversal the skip link above exists to answer. */}
                {rail.collapsed ? (
                  <div className="col-start-1 row-span-3 row-start-1 hidden shrink-0 lg:block">
                    <NavigatorRailCollapsed
                      onExpand={expand}
                      focusToggleOnMount={interacted}
                      orgSlug={orgSlug}
                    />
                  </div>
                ) : (
                  <div className="col-start-1 row-span-3 row-start-1 hidden min-h-0 shrink-0 lg:flex">
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

                {/* Row 1, columns 2–3 — the command band. It spans the stage AND the drawer's
                    column, which is §4a solved by geometry: opening the drawer redistributes width
                    between `<main>` and the drawer, both inside this span, so the band changes by
                    zero. The rail is outside the span and is a fixed column, so it cannot affect it
                    either. */}
                <ChromeBandRow
                  rowsSlotRef={rowsSlotRef}
                  className="col-span-2 col-start-2 row-start-1"
                />

                {/* Row 2, column 2 — the one `<main>` for the page. `min-h-0` lets it shrink to the
                    shell; `overflow-auto` gives screens taller than the viewport somewhere to go,
                    so the band and the rail stay put while the content moves.

                    `id="main"` is the skip link's target and `tabIndex={-1}` is what makes the jump
                    actually move focus: without it the browser scrolls to the element and leaves
                    focus where it was, so the next Tab resumes inside the rail — the failure the
                    link exists to fix, silently reintroduced. */}
                <main
                  id="main"
                  tabIndex={-1}
                  className="col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-auto focus-visible:outline-none"
                >
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
