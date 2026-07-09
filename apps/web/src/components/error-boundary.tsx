import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-root error boundary. Catches render/runtime errors, shows a friendly,
 * recoverable fallback, and (in future) reports to telemetry. Never surfaces raw
 * stack traces to users (docs/FRONTEND_ARCHITECTURE.md → Error handling).
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // TODO(telemetry): report to the telemetry facade once wired.
    console.error('Unhandled UI error', error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
              An unexpected error occurred. Reloading usually fixes it.
            </p>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
