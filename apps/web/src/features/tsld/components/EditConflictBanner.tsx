import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface EditConflictBannerProps {
  message: string;
  /** Refetch the latest server truth (shown only when a refresh resolves the conflict). */
  onRefresh?: () => void;
  onDismiss: () => void;
}

/**
 * A non-destructive conflict surface for a rejected edit (M2, §3 of the design). Shown when
 * a write is refused — a stale optimistic-lock `version` (someone else changed the plan), a
 * cycle, or a duplicate link. It never discards the user's other work and never silently
 * overwrites: it explains what happened and offers a refresh. `role="alert"` announces it.
 */
export function EditConflictBanner({
  message,
  onRefresh,
  onDismiss,
}: EditConflictBannerProps): React.ReactElement {
  return (
    <div
      role="alert"
      className="border-warning/40 bg-warning/10 text-warning-text flex items-start gap-3 rounded-lg border px-3 py-2 text-sm"
    >
      <p className="flex-1">{message}</p>
      {onRefresh ? (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="focus-visible:ring-ring rounded-md p-2 hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
