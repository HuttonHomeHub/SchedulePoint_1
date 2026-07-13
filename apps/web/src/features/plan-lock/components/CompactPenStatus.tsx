import type { PlanPen } from '../api/use-plan-edit-lock';
import { lockCopy } from '../lib/lock-copy';
import { type LockTone } from '../lib/lock-view';
import { usePenLockView } from '../lib/use-pen-lock-view';

import { EditLockControls } from './EditLockControls';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface CompactPenStatusProps {
  pen: PlanPen;
  /** The signed-in user's id — tells "my pending request" from someone else's. */
  currentUserId?: string;
  /** Fixed clock for the asides (tests). Live-ticks when omitted. */
  now?: number;
}

/** Tone → a subtle chip tint. Colour is never the sole signal (the badge text carries state). */
const TONE_TINT: Record<LockTone, string> = {
  neutral: 'text-foreground',
  editing: 'text-foreground',
  locked: 'text-warning-text',
  lost: 'text-warning-text',
};

/**
 * The **compact** "who holds the pen" surface for the canvas-first workspace header (ADR-0031),
 * replacing {@link EditLockBanner}'s full card so the toolbar row stays slim. It renders from the
 * same {@link usePenLockView} orchestration, so **every ADR-0028 hand-off action stays reachable**
 * (Start / Stop / Request / Take-over / Override / Keep / Dismiss) and every transition is announced
 * — it is still a polite `role="status"` live region, just tighter chrome. Renders nothing when the
 * pen layer is off; a terse loading chip while status resolves.
 */
export function CompactPenStatus({
  pen,
  currentUserId,
  now,
}: CompactPenStatusProps): React.ReactElement | null {
  const { penManaged, view, containerRef, controlsProps } = usePenLockView(pen, currentUserId, now);

  if (!penManaged) return null;

  const base = 'flex min-w-0 items-center gap-2 text-sm';

  if (!view) {
    return (
      <div ref={containerRef} role="status" aria-busy="true" tabIndex={-1} className={base}>
        <span className="text-muted-foreground">{lockCopy.loading}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        base,
        'focus-visible:ring-ring rounded-md focus-visible:outline-none',
        TONE_TINT[view.tone],
      )}
    >
      <Badge variant={view.tone === 'locked' || view.tone === 'lost' ? 'warning' : 'neutral'}>
        {view.badge}
      </Badge>
      {/* The message stays in the live region (announced) but is visually truncated to keep the
          header slim; the aria-hidden aside (active …/countdown) never re-announces on its tick. */}
      <span className="max-w-[22ch] truncate sm:max-w-none">
        {view.message}
        {view.aside ? (
          <span aria-hidden="true" className="text-muted-foreground ml-1">
            ({view.aside})
          </span>
        ) : null}
      </span>
      <EditLockControls {...controlsProps} />
    </div>
  );
}
