import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail, NavigatorRailCollapsed } from './navigator-rail';
import { RailResizer } from './rail-resizer';
import { ShellContext } from './shell-context';
import { useRailPrefs } from './use-rail-prefs';

import { ChromeBand } from '@/components/layout/chrome/chrome-band';
import { AnnouncerProvider, useAnnounce } from '@/components/ui/announcer';
import { Sheet } from '@/components/ui/sheet';
import { Surface } from '@/components/ui/surface';
import { NAV_TREE_CRUD_ENABLED } from '@/config/env';
import { useExpansionState } from '@/features/navigator';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** `lg` breakpoint (64rem) as a media query — the pinned rail takes over at/above it. */
const LG_QUERY = '(min-width: 64rem)';

/**
 * The persistent app-shell (ADR-0029): a top bar + Project Explorer rail + a single
 * workspace region that stay **mounted once**, so navigating between plans swaps only
 * the `<Outlet/>` and the rail keeps its state and warm cache. On `lg`+ the rail is
 * pinned (collapsible + resizable); below `lg` it is an off-canvas drawer opened from
 * the header. Gated by `VITE_NAV_TREE` — see {@link AuthedLayout} for the flag-off
 * path, which stays byte-for-byte today's layout.
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
  // In-tree CRUD is gated by the flag *and* write RBAC — Contributors/Viewers keep a
  // read-only tree. The API re-checks; this is UX only.
  const role = useOrgRole(orgSlug ?? '');
  const canWrite = NAV_TREE_CRUD_ENABLED && canManageHierarchy(role);

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
        {/* `h-dvh`, NOT `min-h-dvh`. A minimum leaves this box's height `auto`, so every
            `flex-1 min-h-0` descendant resolves against content instead of the viewport and the
            workspace region silently becomes unbounded. The canvas could never reveal that — it
            sizes itself from a ResizeObserver and simply fills whatever it is given — but the
            Gantt's virtualizer measures its scroller, found it as tall as its own content, and
            rendered every row (ADR-0059 §1's premise, falsified by a layout bug rather than by
            the substrate choice).

            The shell is therefore exactly the viewport and `<main>` scrolls (below), rather than
            the document scrolling: with a persistent header and rail, scrolling the page moved the
            chrome off-screen anyway. Making the root a fixed height WITHOUT giving the content a
            scroller is the trap in between — a screen taller than the viewport stops scrolling and
            starts colliding, which is exactly what it did to the plan workspace's docked panel. */}
        <div className="flex h-dvh flex-col overflow-hidden">
          {/* The chrome band owns the header and (flag-on) the slot a plan's toolbar portals
              into — so the top of the app reads as one designed surface without the shell ever
              learning what a plan is (ADR-0029 / ADR-0055 §3). Flag-off it is just the header. */}
          <ChromeBand>
            <div className="flex min-h-0 flex-1">
              {rail.collapsed ? (
                <div className="hidden shrink-0 lg:block">
                  <NavigatorRailCollapsed onExpand={expand} focusToggleOnMount={interacted} />
                </div>
              ) : (
                <>
                  <div className="hidden shrink-0 lg:block" style={{ width: rail.width }}>
                    <NavigatorRail
                      orgSlug={orgSlug}
                      expansion={expansion}
                      onCollapse={collapse}
                      focusToggleOnMount={interacted}
                    />
                  </div>
                  {/* The resizer sits *between* the rail and `<main>`, but it is rail chrome, so
                    it takes the rail's colours. `contents` keeps the scope purely a colour
                    context — custom properties still inherit, and no box is added to the row. */}
                  <Surface tone="panel" className="contents">
                    <RailResizer width={rail.width} onResize={rail.setWidth} />
                  </Surface>
                </>
              )}
              {/* The single workspace region — the one <main> for the page; routed screens
                render their content into it (M3). */}
              {/* The workspace region is the scroller. `min-h-0` lets it actually shrink to the
                  shell (without it a tall child would push the flex item past the viewport and
                  nothing would scroll); `overflow-auto` gives screens taller than the viewport
                  somewhere to go, so the header and rail stay put while the content moves. */}
              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
                <Outlet />
              </main>
            </div>
          </ChromeBand>
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
      </NavigatorCrud>
    </ShellContext.Provider>
  );
}
