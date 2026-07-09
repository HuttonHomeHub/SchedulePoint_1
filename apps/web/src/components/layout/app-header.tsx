import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useSession, useSignOut } from '@/features/auth';
import { OrgSwitcher } from '@/features/organizations';
import { cn } from '@/lib/utils';

const NAV_LINK_CLASS =
  'text-muted-foreground hover:text-foreground [&.active]:text-foreground rounded-md px-2 py-1 [&.active]:font-medium';
const NAV_LINK_ACTIVE_CLASS = 'text-foreground font-medium';

/** The app shell header: product name, org nav, theme toggle, current user, sign-out. */
export function AppHeader(): React.ReactElement {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // A project's plans live at /orgs/:slug/projects/:id (a sibling of /clients),
  // so keep the Clients nav item current across the whole hierarchy tree.
  const onHierarchy = /\/orgs\/[^/]+\/(clients|projects)(\/|$)/.test(pathname);

  return (
    <header className="border-border bg-background sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <span className="font-semibold tracking-tight">SchedulePoint</span>
        <OrgSwitcher />
        {orgSlug ? (
          <nav aria-label="Organisation" className="flex items-center gap-1 text-sm">
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
            <Link to="/orgs/$orgSlug/members" params={{ orgSlug }} className={NAV_LINK_CLASS}>
              Members
            </Link>
          </nav>
        ) : null}
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
