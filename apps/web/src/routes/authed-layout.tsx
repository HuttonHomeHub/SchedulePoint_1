import { Outlet } from '@tanstack/react-router';

import { AppHeader } from '@/components/layout/app-header';
import { AnnouncerProvider } from '@/components/ui/announcer';

/** The authenticated app shell: header + routed content, with a shared live region. */
export function AuthedLayout(): React.ReactElement {
  return (
    <AnnouncerProvider>
      <div className="flex min-h-dvh flex-col">
        <AppHeader />
        <Outlet />
      </div>
    </AnnouncerProvider>
  );
}
