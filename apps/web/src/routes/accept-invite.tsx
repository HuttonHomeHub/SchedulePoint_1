import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AcceptInvitationCard, InviteExitLinks, InviteShell } from '@/features/members';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useNoindex } from '@/hooks/use-noindex';

/**
 * Public route for accepting an invitation from an email/share link.
 *
 * **The token is captured once into component state and stripped from the URL immediately**
 * (`docs/TECH_DEBT.md` #102 item 2). An invitation token is a live capability grant — it makes the
 * bearer a member of somebody else's organisation — and left in the address bar it sits in browser
 * history for the life of the tab and rides along in the referrer of any later navigation.
 * `Referrer-Policy: strict-origin-when-cross-origin` stops it leaving the origin; it does nothing
 * about history, a shared screen, or a pasted URL.
 *
 * This is `reset-password.tsx`'s mechanism, verbatim and for the same reason. That sibling has
 * always done it and this route never did, which is what made the gap worth a row rather than a
 * judgement: one of two token-bearing public screens applied the rule.
 *
 * A `useState` initialiser rather than an effect, again following the sibling: an effect would run
 * after a render in which the token is already gone from `search`, and there would be nothing left
 * to capture.
 */
export function AcceptInviteScreen(): React.ReactElement {
  useNoindex();
  useDocumentTitle('Accept your invitation');
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [token] = useState(() =>
    'token' in search && typeof search.token === 'string' ? search.token : '',
  );

  useEffect(() => {
    if (token === '') return;
    void navigate({ to: '/accept-invite', search: {}, replace: true });
  }, [token, navigate]);

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
