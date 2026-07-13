import type { PlanPen } from '../api/use-plan-edit-lock';
import { lockCopy } from '../lib/lock-copy';
import { type LockTone } from '../lib/lock-view';
import { usePenLockView } from '../lib/use-pen-lock-view';

import { EditLockControls } from './EditLockControls';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EditLockBannerProps {
  pen: PlanPen;
  /** The signed-in user's id — tells "my pending request" from someone else's. */
  currentUserId?: string;
  /** Fixed clock for the "active …" / countdown asides (tests). Live-ticks when omitted. */
  now?: number;
}

/** Tone → container token recipe + badge variant. Colour never the sole signal (badge text carries state). */
const TONE_STYLES: Record<LockTone, { container: string; badge: 'neutral' | 'warning' }> = {
  neutral: { container: 'border-border bg-muted/40 text-foreground', badge: 'neutral' },
  editing: { container: 'border-primary/40 bg-primary/5 text-foreground', badge: 'neutral' },
  locked: { container: 'border-warning/40 bg-warning/10 text-warning-text', badge: 'warning' },
  lost: { container: 'border-warning/40 bg-warning/10 text-warning-text', badge: 'warning' },
};

const CONTAINER = 'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm';

/**
 * The single "who holds the pen" surface for a plan's schedule-editing region
 * (ADR-0028 / design §2). A **polite live region** (`role="status"`) so each state
 * transition is announced without stealing focus (WCAG 4.1.3). It is a **pure
 * function of the lock status + local flags** — every control is keyed on a server
 * capability flag, never a re-derived rule.
 *
 * Focus management (WCAG 2.4.3): a control's button unmounts when the state it
 * triggered arrives (Start → the "Start" button is replaced by "Stop"), which would
 * otherwise drop focus to `<body>`. After the user's OWN action we move focus to the
 * banner container (a `tabIndex=-1` stable anchor). The frequently-updating "active
 * …" / grace-countdown text is an **aria-hidden** aside (so a poll never re-announces
 * the banner), and a lost-control event scrolls the banner into view so it's legible
 * wherever the user is working. Renders nothing when the pen layer is off; a loading
 * placeholder while status is still resolving.
 */
export function EditLockBanner({
  pen,
  currentUserId,
  now,
}: EditLockBannerProps): React.ReactElement | null {
  // All the delicate hand-off orchestration (view resolution, tick, focus return, lost-control
  // scroll, the Keep-editing dismissal) lives in one shared hook so the compact toolbar pen-status
  // renders identically (ADR-0031). This card is just the presentation.
  const { penManaged, view, containerRef, controlsProps } = usePenLockView(pen, currentUserId, now);

  if (!penManaged) return null;

  if (!view) {
    // Status still loading — a placeholder (not silence) so gated affordances that
    // are hidden until `holdsPen` resolves have a visible, announced explanation.
    return (
      <div role="status" aria-busy="true" className={cn(CONTAINER, TONE_STYLES.neutral.container)}>
        <span className="text-muted-foreground">{lockCopy.loading}</span>
      </div>
    );
  }

  const tone = TONE_STYLES[view.tone];

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        CONTAINER,
        'focus-visible:ring-ring focus-visible:outline-none',
        tone.container,
      )}
    >
      <Badge variant={tone.badge}>{view.badge}</Badge>
      <p className="min-w-0 flex-1">
        {view.message}
        {view.aside ? (
          <span aria-hidden="true" className="text-muted-foreground ml-1">
            ({view.aside})
          </span>
        ) : null}
      </p>
      <EditLockControls {...controlsProps} />
    </div>
  );
}
