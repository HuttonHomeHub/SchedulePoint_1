import { useSearch } from '@tanstack/react-router';

import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AcceptInvitationCard, InviteExitLinks, InviteShell } from '@/features/members';
import { useNoindex } from '@/hooks/use-noindex';

/** Public route for accepting an invitation from an email/share link. */
export function AcceptInviteScreen(): React.ReactElement {
  useNoindex();
  const search = useSearch({ strict: false });
  const token = 'token' in search && typeof search.token === 'string' ? search.token : '';

  if (!token) {
    // Share the invite flow's single `main` landmark rather than hand-rolling
    // a second one (WCAG 1.3.1 — one main per page).
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Invitation not found</CardTitle>
          <CardDescription>This link is missing its invitation token.</CardDescription>
        </CardHeader>
        <InviteExitLinks />
      </InviteShell>
    );
  }

  return <AcceptInvitationCard token={token} />;
}
