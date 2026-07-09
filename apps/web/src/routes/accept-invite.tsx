import { useSearch } from '@tanstack/react-router';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AcceptInvitationCard } from '@/features/members';

/** Public route for accepting an invitation from an email/share link. */
export function AcceptInviteScreen(): React.ReactElement {
  const search = useSearch({ strict: false });
  const token = 'token' in search && typeof search.token === 'string' ? search.token : '';

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
            <CardDescription>This link is missing its invitation token.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return <AcceptInvitationCard token={token} />;
}
