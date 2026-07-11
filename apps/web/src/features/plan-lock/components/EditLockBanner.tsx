import { useState } from 'react';

import type { PlanPen } from '../api/use-plan-edit-lock';
import { type LockTone, resolveLockView } from '../lib/lock-view';

import { EditLockControls } from './EditLockControls';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EditLockBannerProps {
  pen: PlanPen;
  /** The signed-in user's id — tells "my pending request" from someone else's. */
  currentUserId?: string;
  /** Injectable clock for the relative "active …" phrase (tests). */
  now?: number;
}

/** Tone → container token recipe + badge variant. Colour never the sole signal (badge text carries state). */
const TONE_STYLES: Record<LockTone, { container: string; badge: 'neutral' | 'warning' }> = {
  neutral: { container: 'border-border bg-muted/40 text-foreground', badge: 'neutral' },
  editing: { container: 'border-primary/40 bg-primary/5 text-foreground', badge: 'neutral' },
  locked: { container: 'border-warning/40 bg-warning/10 text-warning-text', badge: 'warning' },
  lost: { container: 'border-warning/40 bg-warning/10 text-warning-text', badge: 'warning' },
};

/**
 * The single "who holds the pen" surface for a plan's schedule-editing region
 * (ADR-0028 / design §2). A **polite live region** (`role="status"`) so each
 * transition ("Jane is editing", "You're now editing", "control was taken over")
 * is announced without stealing focus (WCAG 4.1.3). It is a **pure function of the
 * lock status + local flags** — every control is keyed on a server capability flag,
 * never a re-derived rule. Renders nothing when the pen layer is off or while status
 * is still loading (no flicker).
 */
export function EditLockBanner({
  pen,
  currentUserId,
  now,
}: EditLockBannerProps): React.ReactElement | null {
  // A requester the holder chose to "Keep editing" past — hides the prompt until a
  // different requester appears (a purely local, transient dismissal).
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);

  if (!pen.penManaged) return null;
  const view = resolveLockView(pen.status, pen.lostControl, currentUserId, dismissedRequestId, now);
  if (!view) return null;

  const tone = TONE_STYLES[view.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm',
        tone.container,
      )}
    >
      <Badge variant={tone.badge}>{view.badge}</Badge>
      <p className="min-w-0 flex-1">{view.message}</p>
      <EditLockControls
        actions={view.actions}
        holder={pen.status?.holder ?? null}
        isPending={pen.isPending}
        onStart={pen.startEditing}
        onStop={pen.stopEditing}
        onRequest={pen.requestControl}
        onTakeOver={pen.takeOver}
        onOverride={pen.takeOver}
        onHandover={pen.handoff}
        onKeep={() => {
          if (pen.status?.requestedBy) setDismissedRequestId(pen.status.requestedBy.id);
        }}
        onDismiss={pen.dismissLost}
      />
    </div>
  );
}
