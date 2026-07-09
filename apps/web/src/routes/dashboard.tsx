import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/features/auth';

/**
 * The authenticated home screen. For the walking skeleton it confirms who is
 * signed in and shows their organisations (none yet — organisation creation
 * lands in the next slice).
 */
export function DashboardScreen(): React.ReactElement {
  const { data: session } = useSession();
  const memberships = session?.memberships ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome{session?.user ? `, ${session.user.name}` : ''}
      </h1>

      {memberships.length === 0 ? (
        <Card className="mt-6 max-w-lg">
          <CardHeader>
            <CardTitle className="text-lg">No organisations yet</CardTitle>
            <CardDescription>
              You don&rsquo;t belong to any organisation yet. Creating and joining organisations
              arrives in the next update.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            You&rsquo;re signed in as {session?.user?.email}.
          </CardContent>
        </Card>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {memberships.map((membership) => (
            <li key={membership.organizationId}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{membership.organizationId}</CardTitle>
                  <CardDescription>Role: {membership.role}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
