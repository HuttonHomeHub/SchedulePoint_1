import { Outlet } from '@tanstack/react-router';

import { AppHeader } from '@/components/layout/app-header';

/** The authenticated app shell: header + routed content. */
export function AuthedLayout(): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <Outlet />
    </div>
  );
}
