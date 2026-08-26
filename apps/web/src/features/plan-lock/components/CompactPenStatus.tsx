import { useId } from 'react';

import type { PlanPen } from '../api/use-plan-edit-lock';
import { lockCopy } from '../lib/lock-copy';
import { type LockTone } from '../lib/lock-view';
import { usePenLockView } from '../lib/use-pen-lock-view';

import { EditLockControls } from './EditLockControls';

import { PenStatusHost } from '@/components/layout/workspace/plan-slot-host';
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
 * {@link usePenLockView} orchestration, so **every ADR-0028 hand-off action stays reachable**
 * (Start / Stop / Request / Take-over / Override / Keep / Dismiss) and every transition is announced
 * — it is still a polite `role="status"` live region, just tighter chrome. Renders nothing when the
 * pen layer is off; a terse loading chip while status resolves.
 *
 * ## The sentence is a fact and lives in the status bar; the controls are actions and stay here
 *
 * The one-row header (2026-08-26) splits this surface across two places without splitting its
 * state. `usePenLockView` is called **once**; the badge and the hand-off controls render here on
 * the plan's identity row, and the live-region sentence portals into the plan status bar through
 * {@link PenStatusHost}. That is ADR-0093's discriminator — an action belongs on its object, a fact
 * belongs where facts are read — applied to a model rather than to a command.
 *
 * It is also what makes the merged header fit. Measured
 * (`docs/specs/one-row-header/falsification.md`): the pen cluster is **320 px** with the sentence
 * on screen during the harness run and **165 px** without it, and the widest of the ten lock
 * sentences is **432 px** — an Org Admin viewing a plan someone else holds. The identity row had
 * **four pixels** of headroom at 1280 before this change, so that state was already truncating the
 * plan name.
 *
 * ### Three things the split has to get right, each of which has a test
 *
 * - **`containerRef` stays here, on the element holding the controls.** It is declared for two jobs
 *   in `use-pen-lock-view.ts` — pulling focus back after the user's own action unmounts the button
 *   they pressed (WCAG 2.4.3), and scrolling the surface into view when the pen is lost. Attached
 *   to the *moved* sentence, both would fire against the status bar, throwing focus to the other end
 *   of the screen after every Start/Stop; a test asserting only "focus is not on `<body>`" would
 *   pass against that, which is why the case that pins it registers a real outlet.
 *
 *   **Only the first job is still real, and this said "two jobs" until the accessibility review
 *   checked.** The shell is `grid h-dvh … overflow-hidden` with `<main>` as the only scroller
 *   (`app-shell.tsx`), and this container now sits in the always-visible header outside it — so
 *   there is nothing for `scrollIntoView` to scroll. It is a no-op rather than a defect, and it is
 *   named here rather than deleted because the hook is shared with `EditLockBanner`, whose host may
 *   scroll.
 * - **The announcement stays complete, and it needs nothing added to make it so.** `aria-atomic`
 *   announces the whole region, and the region is now the sentence alone — but every one of the ten
 *   sentences in `lock-copy.ts` is self-contained ("No one is editing this plan.", "Alexandra is
 *   editing this plan.", "Editing control was taken over — you're now read-only."). The badge is a
 *   one-word **summary** of the sentence, not extra information, so nothing is lost by the region
 *   no longer containing it.
 *
 *   This shipped for one commit with an `sr-only` copy of the badge word inside the region, added
 *   out of caution. It was wrong twice over: on focus return the container announces its own
 *   contents (the visible badge) **and** its description (the region), so the word was read twice;
 *   and `e2e-edit/pen-smoke.spec.ts` went red on `getByText('Available')` resolving to two elements
 *   — a journey written for something else catching a duplication a unit test had no reason to
 *   look for.
 * - **Focus return still says what happened.** The controls container is `aria-describedby` the
 *   sentence region, which works across the portal because a description is resolved by id
 *   anywhere in the document. So landing on the controls after a hand-off still reads the full
 *   state, exactly as it did when the two were one element.
 *
 * With no {@link PenStatusHost} outlet registered — every unit test, and any future host outside a
 * plan workspace — the sentence renders **in place, in its original position between the badge and
 * the controls**. `CompactPenStatus.test.tsx` therefore passes unedited, which is the evidence that
 * the split changed no behaviour rather than the belief that it did not.
 */
export function CompactPenStatus({
  pen,
  currentUserId,
  now,
}: CompactPenStatusProps): React.ReactElement | null {
  const { penManaged, view, containerRef, controlsProps } = usePenLockView(pen, currentUserId, now);
  const sentenceId = useId();

  if (!penManaged) return null;

  const base = 'flex min-w-0 items-center gap-2 text-sm';

  if (!view) {
    return (
      <div ref={containerRef} tabIndex={-1} className={base}>
        <PenStatusHost>
          <div role="status" aria-busy="true" className={base}>
            <span className="text-muted-foreground">{lockCopy.loading}</span>
          </div>
        </PenStatusHost>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      // A stable hook for the measurement harness and the journey, and it earned its keep
      // immediately: `m1-merged-probe` located the pen cluster by searching for one of the ten lock
      // sentences, so the moment the sentence portalled away the probe started measuring the
      // sentence's new home in the facts row and reported the merged row **without the pen controls
      // in it at all** — an instrument that silently changed subject at exactly the change it was
      // built to measure. `data-plan-identity` beside it exists for the same reason.
      data-plan-pen=""
      aria-describedby={sentenceId}
      className={cn(
        base,
        'focus-visible:ring-ring rounded-md focus-visible:outline-none',
        TONE_TINT[view.tone],
      )}
    >
      <Badge variant={view.tone === 'locked' || view.tone === 'lost' ? 'warning' : 'neutral'}>
        {view.badge}
      </Badge>
      <PenStatusHost>
        <div
          id={sentenceId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          // **No `text-sm` here, and that is the point rather than an omission.** `base` carries
          // one, which is right for the controls container beside a `text-sm` button — and it
          // travelled with the sentence through the portal into `PlanFacts`, a `text-xs` row, so
          // "You're editing this plan." rendered visibly larger than "Activities 10" beside it. A
          // component styled for its old home, whose type scale nobody re-derived for its new one
          // (`UX_STANDARDS.md`: hierarchy comes from the scales, not ad-hoc sizes). Found on the
          // rendered screenshot by the ux review, not in the code.
          //
          // Inheriting is what makes both homes right: `text-xs` in the facts row, and `text-sm`
          // from the controls container in the in-place fallback, which is why that fallback is
          // still byte-identical to the pre-split markup.
          className={cn('flex min-w-0 items-center gap-2', TONE_TINT[view.tone])}
        >
          {/* The message is visually truncated to keep the row slim and stays whole in the live
              region; the aria-hidden aside (active …/countdown) never re-announces on its tick. */}
          <span className="max-w-[22ch] truncate sm:max-w-none">
            {view.message}
            {view.aside ? (
              <span aria-hidden="true" className="text-muted-foreground ml-1">
                ({view.aside})
              </span>
            ) : null}
          </span>
        </div>
      </PenStatusHost>
      <EditLockControls {...controlsProps} />
    </div>
  );
}
