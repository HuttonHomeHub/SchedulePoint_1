import { Link } from '@tanstack/react-router';
import { Building2, CalendarDays, ScrollText, Trash2, Users, Wrench } from 'lucide-react';

import { AUDIT_LOG_ENABLED, RESOURCES_ENABLED } from '@/config/env';
import { canManageHierarchy, canReadAuditLog, useOrgRole } from '@/hooks/use-org-role';

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
 * **Icons are decorative and the text is the label**, not the other way round: these are
 * destinations a planner reads down a list, not a toolbar of glyphs. Every icon is `aria-hidden`
 * and no link depends on one to be identifiable.
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
  'text-muted-foreground hover:text-foreground hover:bg-muted [&.active]:text-foreground [&.active]:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm [&.active]:font-medium';

export function OrgDestinations({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);

  return (
    <nav
      aria-label="Organisation"
      className="border-border flex shrink-0 flex-col gap-0.5 border-t p-2"
    >
      <Link to="/orgs/$orgSlug/clients" params={{ orgSlug }} className={DESTINATION_CLASS}>
        <Building2 aria-hidden="true" className="size-4 shrink-0" />
        Clients
      </Link>
      <Link to="/orgs/$orgSlug/calendars" params={{ orgSlug }} className={DESTINATION_CLASS}>
        <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        Calendars
      </Link>
      {RESOURCES_ENABLED ? (
        <Link to="/orgs/$orgSlug/resources" params={{ orgSlug }} className={DESTINATION_CLASS}>
          <Wrench aria-hidden="true" className="size-4 shrink-0" />
          Resources
        </Link>
      ) : null}
      <Link to="/orgs/$orgSlug/members" params={{ orgSlug }} className={DESTINATION_CLASS}>
        <Users aria-hidden="true" className="size-4 shrink-0" />
        Members
      </Link>
      {/* Org Admin only (ADR-0072). Hiding it for other roles is a courtesy, not the control:
          the API answers 403 whether or not this link is rendered. */}
      {AUDIT_LOG_ENABLED && canReadAuditLog(role) ? (
        <Link to="/orgs/$orgSlug/audit-log" params={{ orgSlug }} className={DESTINATION_CLASS}>
          <ScrollText aria-hidden="true" className="size-4 shrink-0" />
          Audit log
        </Link>
      ) : null}
      {canWrite ? (
        <Link
          to="/orgs/$orgSlug/recently-deleted"
          params={{ orgSlug }}
          className={DESTINATION_CLASS}
        >
          <Trash2 aria-hidden="true" className="size-4 shrink-0" />
          Recently deleted
        </Link>
      ) : null}
    </nav>
  );
}
