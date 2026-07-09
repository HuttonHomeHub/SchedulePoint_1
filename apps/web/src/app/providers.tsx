import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { queryClient, router } from '@/app/router';
import { AppErrorBoundary } from '@/components/error-boundary';
import { ThemeProvider } from '@/hooks/use-theme';

/** Composes the app-wide providers: server state, theme, error boundary, router. */
export function Providers(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
