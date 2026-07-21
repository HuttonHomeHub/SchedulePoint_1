import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Banner severity: a rejected/failed action (`warning`, default) vs. an informational succeeded-but-note
 * surface (`info`, e.g. a lossy-but-successful export). Only the colour + the ARIA role differ. */
export type EditConflictBannerSeverity = 'warning' | 'info';

export interface EditConflictBannerProps {
  message: string;
  /** Refetch the latest server truth (shown only when a refresh resolves the conflict). */
  onRefresh?: () => void;
  onDismiss: () => void;
  /** Severity — `warning` (default, a rejected/failed action) or `info` (a succeeded-but-note surface). */
  severity?: EditConflictBannerSeverity;
  /** An optional extra action button (e.g. "Download report" on a lossy export notice). */
  action?: { label: string; onClick: () => void };
}

/**
 * A non-destructive inline banner for a refused or noted action (M2, §3 of the design). At `warning`
 * severity (default) it surfaces a rejected write — a stale optimistic-lock `version` (someone else
 * changed the plan), a cycle, or a duplicate link — and never discards the user's other work; at `info`
 * severity it surfaces a succeeded-but-note outcome (e.g. a lossy-but-successful export, ADR-0050 M4d).
 * It explains what happened and offers a refresh and/or a bespoke {@link action}. A `warning` uses
 * `role="alert"` (assertive); an `info` uses `role="status"` (polite), so it doesn't interrupt.
 */
export function EditConflictBanner({
  message,
  onRefresh,
  onDismiss,
  severity = 'warning',
  action,
}: EditConflictBannerProps): React.ReactElement {
  return (
    <div
      role={severity === 'info' ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2 text-sm',
        severity === 'info'
          ? 'border-info/40 bg-info/10 text-info-text'
          : 'border-warning/40 bg-warning/10 text-warning-text',
      )}
    >
      <p className="flex-1">{message}</p>
      {onRefresh ? (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}
      {action ? (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
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
