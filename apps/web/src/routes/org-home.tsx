import { useParams } from '@tanstack/react-router';

import { OverviewScreen } from '@/features/overview';

/**
 * The organisation home screen (`/orgs/$orgSlug`) — where every sign-in lands.
 *
 * **It used to be a welcome card and is now the organisation overview** (ADR-0098). The card said
 * "Select a plan from the Project Explorer", which is a description of the rail one column away
 * rather than an answer to the question a planner actually arrives with: what has moved since I was
 * last here, and is anything waiting on me.
 *
 * The route tier stays a host — it resolves the slug and renders the screen. It adds **no landmark**:
 * the app shell already provides the single `<main>` (`app-shell.tsx`), and a second one here would
 * give every authenticated screen two, with nothing to tell a landmark-navigating reader which held
 * the content.
 */
export function OrgHomeScreen(): React.ReactElement | null {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;

  if (orgSlug === undefined) return null;
  return <OverviewScreen orgSlug={orgSlug} />;
}
