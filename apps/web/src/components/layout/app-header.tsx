import { Link, useParams, useRouterState } from '@tanstack/react-router';
import { Menu } from 'lucide-react';

import { AccountChip } from '@/components/layout/account-chip';
import { BrandMark } from '@/components/layout/brand-mark';
import { useShell } from '@/components/layout/navigator/shell-context';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { AUDIT_LOG_ENABLED, RESOURCES_ENABLED } from '@/config/env';
import { OrgSwitcher } from '@/features/organizations';
import { canManageHierarchy, canReadAuditLog, useOrgRole } from '@/hooks/use-org-role';
import { cn } from '@/lib/utils';

const NAV_LINK_CLASS =
  'text-muted-foreground hover:text-foreground [&.active]:text-foreground shrink-0 rounded-md px-2 py-1 whitespace-nowrap [&.active]:font-medium';
const NAV_LINK_ACTIVE_CLASS = 'text-foreground font-medium';

/**
 * The header's contents — brand mark, org nav, and the account chip (theme, identity, sign-out).
 *
 * Split from the element that carries it because the two shell shapes place it differently:
 * flag-off the header IS the chrome surface and centres its row at `max-w-6xl` (today's shell);
 * flag-on it is one row inside a full-bleed band that already owns the scope, the sticky
 * behaviour and the border. Keeping the split explicit means neither path branches on a flag
 * inside its own markup.
 *
 * A `1fr auto 1fr` grid (feature-spec.md §4.9, ADR-0056) — not a flex row with `flex-1`/`ml-auto`
 * — so the centre cell (org switcher + nav) sits at the true midpoint between the brand and the
 * account chip rather than merely absorbing whatever space the edges don't claim. **Centred while
 * it fits, filling when it does not**: `min-w-0` on every cell plus the nav's own
 * `overflow-x-auto` means a long org name or a crowded nav scrolls internally rather than pushing
 * the account chip off-screen or breaking the grid. DOM order (drawer → brand → org switcher →
 * nav → account) is unchanged from the previous flex markup, so the pinned tab order holds by
 * construction — no `order-*`, no absolute positioning.
 */
function HeaderContents(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // A project's plans live at /orgs/:slug/projects/:id (a sibling of /clients),
  // so keep the Clients nav item current across the whole hierarchy tree.
  const onHierarchy = /\/orgs\/[^/]+\/(clients|projects)(\/|$)/.test(pathname);
  // The recycle bin is a writer surface (only writers can restore); non-writers
  // never see the entry point, though the API read itself is member-level.
  const role = useOrgRole(orgSlug ?? '');
  const canWrite = canManageHierarchy(role);
  // Opens the rail as a drawer below `lg`, where the pinned rail is hidden. Null outside the
  // shell — this header is also rendered by `chrome-band.tsx` on the DESIGNED_CHROME-off path.
  const shell = useShell();

  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-4">
      <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-start">
        {shell && orgSlug ? (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            aria-label="Show Project Explorer"
            onClick={shell.openDrawer}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        ) : null}
        <BrandMark />
      </div>
      <div className="flex min-w-0 items-center gap-2 justify-self-center">
        <OrgSwitcher className="max-w-[12rem] truncate" />
        {orgSlug ? (
          // Nav shrinks and scrolls horizontally on narrow viewports so it never
          // pushes the header (or page) into overflow. A proper drawer-below-lg
          // shell is still owed — see TECH_DEBT.md.
          <nav
            aria-label="Organisation"
            className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm"
          >
            <Link
              to="/orgs/$orgSlug"
              params={{ orgSlug }}
              activeOptions={{ exact: true }}
              className={NAV_LINK_CLASS}
            >
              Overview
            </Link>
            <Link
              to="/orgs/$orgSlug/clients"
              params={{ orgSlug }}
              aria-current={onHierarchy ? 'page' : undefined}
              className={cn(NAV_LINK_CLASS, onHierarchy && NAV_LINK_ACTIVE_CLASS)}
            >
              Clients
            </Link>
            <Link to="/orgs/$orgSlug/calendars" params={{ orgSlug }} className={NAV_LINK_CLASS}>
              Calendars
            </Link>
            {RESOURCES_ENABLED ? (
              <Link to="/orgs/$orgSlug/resources" params={{ orgSlug }} className={NAV_LINK_CLASS}>
                Resources
              </Link>
            ) : null}
            <Link to="/orgs/$orgSlug/members" params={{ orgSlug }} className={NAV_LINK_CLASS}>
              Members
            </Link>
            {/* Org Admin only (ADR-0072). Hiding it for other roles is a courtesy, not the
                control: the API answers 403 whether or not this link is rendered. */}
            {AUDIT_LOG_ENABLED && canReadAuditLog(role) ? (
              <Link to="/orgs/$orgSlug/audit-log" params={{ orgSlug }} className={NAV_LINK_CLASS}>
                Audit log
              </Link>
            ) : null}
            {canWrite ? (
              <Link
                to="/orgs/$orgSlug/recently-deleted"
                params={{ orgSlug }}
                className={NAV_LINK_CLASS}
              >
                Recently deleted
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        <AccountChip />
      </div>
    </div>
  );
}

/**
 * The header as its own chrome surface — today's shell, and the `VITE_DESIGNED_CHROME` flag-off
 * path. Centred at `max-w-6xl` to line up with the still-centred route bodies.
 */
export function AppHeader(): React.ReactElement {
  return (
    <Surface tone="chrome" as="header" className="border-border sticky top-0 z-10 border-b">
      <div className="mx-auto h-14 max-w-6xl px-4">
        <HeaderContents />
      </div>
    </Surface>
  );
}

/**
 * The header as the first row of the chrome band. Full-bleed — the band is chrome, and chrome
 * spans the viewport; the measure cap belongs to content, which keeps its own `max-w-6xl`. The
 * band owns the surface scope, the sticky position and the bottom border, so this is a bare
 * landmark.
 */
export function AppHeaderRow(): React.ReactElement {
  return (
    <header className="h-14 px-4">
      <HeaderContents />
    </header>
  );
}
