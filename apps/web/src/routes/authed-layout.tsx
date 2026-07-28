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
      {/* `h-dvh` + a scrolling `<main>`, for the same reason as {@link AppShell}: a minimum leaves
          the height `auto` and every `flex-1 min-h-0` below it stops being bounded by the viewport.
          This is the `VITE_NAV_TREE=false` rollback path, so it has to carry the fix too —
          otherwise rolling the navigator back would resurrect the bug — and it has to carry BOTH
          halves, because a fixed root without a scroller turns "too tall" into "collides". */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
    </AnnouncerProvider>
  );
}
