import { useNavigate } from '@tanstack/react-router';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useSession, useSignOut } from '@/features/auth';
import { OrgSwitcher } from '@/features/organizations';

/** The app shell header: product name, theme toggle, current user, sign-out. */
export function AppHeader(): React.ReactElement {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();

  return (
    <header className="border-border bg-background sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <span className="font-semibold tracking-tight">SchedulePoint</span>
        <OrgSwitcher />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {session?.user ? (
            <span
              className="text-muted-foreground hidden text-sm sm:inline"
              data-testid="user-email"
            >
              {session.user.email}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={signOut.isPending}
            aria-busy={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, {
                onSuccess: () => {
                  void navigate({ to: '/sign-in' });
                },
              })
            }
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
