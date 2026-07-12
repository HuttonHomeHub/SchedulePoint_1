import { Outlet } from '@tanstack/react-router';

import { AppHeader } from '@/components/layout/app-header';
import { AppShell } from '@/components/layout/navigator/app-shell';
import { AnnouncerProvider } from '@/components/ui/announcer';
import { NAV_TREE_ENABLED } from '@/config/env';

/**
 * The authenticated app shell. With `VITE_NAV_TREE` on it is the persistent
 * app-shell (ADR-0029 — {@link AppShell}: mounted-once top bar + Project Explorer
 * rail + workspace region). With the flag off it stays exactly today's layout:
 * header + routed content, so `main` remains releasable during the rollout.
 */
export function AuthedLayout(): React.ReactElement {
  if (NAV_TREE_ENABLED) return <AppShell />;

  return (
    <AnnouncerProvider>
      <div className="flex min-h-dvh flex-col">
        <AppHeader />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </AnnouncerProvider>
  );
}
