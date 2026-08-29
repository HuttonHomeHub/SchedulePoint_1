import { Link } from '@tanstack/react-router';
import {
  Building2,
  CalendarDays,
  ScrollText,
  Trash2,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { AUDIT_LOG_ENABLED, RESOURCES_ENABLED } from '@/config/env';
import { canManageHierarchy, canReadAuditLog, useOrgRole } from '@/hooks/use-org-role';
import { cn } from '@/lib/utils';

/**
 * The organisation's **destinations** — the rail's bottom zone (ADR-0097 Landing D1).
 *
 * These six links lived in the app header until 2026-08-19. They belong here because they are
 * *places in the organisation*, and the rail is where "where am I in this organisation" is
 * answered — the tree above says where you are in the work, and these say where you are in
 * everything around it. One navigator instead of two.
 *
 * **`aria-current="page"` finally has one home.** The header marked the current page with grey and
 * weight while the tree marked its selection separately, so a reader had two current-state
 * treatments in two places and no relationship between them. `Link`'s own `.active` class does it
 * here, once.
 *
 * **Icons are decorative and the text is the label** in the expanded rail, not the other way round:
 * these are destinations a planner reads down a list, not a toolbar of glyphs. Every icon is
 * `aria-hidden` and no link depends on one to be identifiable. The collapsed rail has no room for
 * text and therefore carries the label on `aria-label` instead — which is why the destinations are
 * **one array rendered two ways** rather than two lists. Two lists is how a seventh destination
 * arrives in one of them and not the other, and the reader who would notice is the one who
 * collapsed the rail.
 *
 * **What was NOT moved, and why.** `screens.md` §3 also puts the organisation switcher and a tree
 * search in the rail's top zone. Neither is here: the measured case for D1
 * (`m0-landing-d1-measurement.md`) is about the **nav**, which is what the band merge costs, and
 * the switcher is 200 px that the merge does not need. Moving controls a planner knows the
 * position of is the accepted cost of this landing, and it is worth paying once for the change
 * that buys something rather than three times in one release — which is why the product owner
 * split Landing D in the first place.
 */
const DESTINATION_CLASS =
  'text-muted-foreground hover:text-foreground hover:bg-muted [&.active]:text-foreground [&.active]:bg-muted flex items-center rounded-md text-sm';

/**
 * `pointer-coarse:min-h-(--control-h)` on both forms (ADR-0118 M3). Measured at 1646 with a coarse
 * pointer, these six rows were **259 x 32** — the largest single group of controls under the house
 * rule anywhere in the product, and the one a planner reaches for first, since they are how you
 * leave a plan. The fine form is unchanged at 32: the row rhythm is a density choice, and the axis
 * is the input device rather than the screen.
 */
const EXPANDED_CLASS =
  'gap-2 px-2 py-1.5 pointer-coarse:min-h-(--control-h) [&.active]:font-medium';
const COLLAPSED_CLASS = 'size-9 pointer-coarse:size-(--control-h) justify-center';

interface Destination {
  label: string;
  /**
   * A literal union, never `string`. `Link`'s `to` accepts a bare `string`, so typing this field
   * loosely would silently give up the router's compile-time route checking for all six — and a
   * typo'd destination is a link that renders, looks right and 404s.
   */
  to:
    | '/orgs/$orgSlug/clients'
    | '/orgs/$orgSlug/calendars'
    | '/orgs/$orgSlug/resources'
    | '/orgs/$orgSlug/members'
    | '/orgs/$orgSlug/audit-log'
    | '/orgs/$orgSlug/recently-deleted';
  Icon: LucideIcon;
  /** Withheld entirely when false — a flag that is off, or a role that has no such place. */
  visible: boolean;
}

function useDestinations(orgSlug: string): Destination[] {
  const role = useOrgRole(orgSlug);

  const all: Destination[] = [
    { label: 'Clients', to: '/orgs/$orgSlug/clients', Icon: Building2, visible: true },
    { label: 'Calendars', to: '/orgs/$orgSlug/calendars', Icon: CalendarDays, visible: true },
    {
      label: 'Resources',
      to: '/orgs/$orgSlug/resources',
      Icon: Wrench,
      visible: RESOURCES_ENABLED,
    },
    { label: 'Members', to: '/orgs/$orgSlug/members', Icon: Users, visible: true },
    // Org Admin only (ADR-0072). Hiding it for other roles is a courtesy, not the control:
    // the API answers 403 whether or not this link is rendered.
    {
      label: 'Audit log',
      to: '/orgs/$orgSlug/audit-log',
      Icon: ScrollText,
      visible: AUDIT_LOG_ENABLED && canReadAuditLog(role),
    },
    {
      label: 'Recently deleted',
      to: '/orgs/$orgSlug/recently-deleted',
      Icon: Trash2,
      visible: canManageHierarchy(role),
    },
  ];
  return all.filter((destination) => destination.visible);
}

export function OrgDestinations({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const destinations = useDestinations(orgSlug);

  return (
    <nav
      aria-label="Organisation"
      className="border-border flex shrink-0 flex-col gap-0.5 border-t p-2"
    >
      {destinations.map(({ label, to, Icon }) => (
        <Link
          key={to}
          to={to}
          params={{ orgSlug }}
          className={cn(DESTINATION_CLASS, EXPANDED_CLASS)}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The same six destinations as an **icon strip**, for the collapsed rail (ADR-0097 Landing D1).
 *
 * Owed by the landing rather than optional: before D1 the organisation nav lived in the header and
 * survived a rail collapse, so collapsing the rail — which is exactly what a planner does to gain
 * canvas width, the thing this whole epic chases — would otherwise have put all six destinations
 * behind a toggle they were never behind before. `migration.md` records that D1 does not ship
 * without it.
 *
 * The text becomes `aria-label` and `title`: an icon with no accessible name is not a link anyone
 * can use, and a sighted planner who has not learnt six glyphs needs the tooltip. The accessible
 * name is the same string the expanded rail shows, so WCAG 2.5.3 Label in Name holds across the
 * collapse and a speech-input user says the same word either way.
 */
export function OrgDestinationsCollapsed({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const destinations = useDestinations(orgSlug);

  return (
    <nav
      aria-label="Organisation"
      className="border-border flex shrink-0 flex-col items-center gap-0.5 border-t p-1"
    >
      {destinations.map(({ label, to, Icon }) => (
        <Link
          key={to}
          to={to}
          params={{ orgSlug }}
          aria-label={label}
          title={label}
          className={cn(DESTINATION_CLASS, COLLAPSED_CLASS)}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      ))}
    </nav>
  );
}
