import { Outlet, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { NavigatorCrud } from './navigator-crud';
import { NavigatorRail, NavigatorRailCollapsed } from './navigator-rail';
import { RailResizer } from './rail-resizer';
import { ShellContext } from './shell-context';
import { useRailPrefs } from './use-rail-prefs';

import { AppHeader } from '@/components/layout/app-header';
import { AnnouncerProvider, useAnnounce } from '@/components/ui/announcer';
import { Sheet } from '@/components/ui/sheet';
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

  // Close the drawer once the viewport reaches `lg`+, where the pinned rail is shown —
  // otherwise a modal drawer lingers behind it (duplicate landmark + stuck focus trap).
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
        <div className="flex min-h-dvh flex-col">
          <AppHeader />
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
                <RailResizer width={rail.width} onResize={rail.setWidth} />
              </>
            )}
            {/* The single workspace region — the one <main> for the page; routed screens
                render their content into it (M3). */}
            <main className="flex min-w-0 flex-1 flex-col">
              <Outlet />
            </main>
          </div>
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
