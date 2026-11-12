import { useEffect, useId } from 'react';

import {
  DISMISS_PLAN_DESCRIPTION,
  FOLLOW_LOGIC_DESCRIPTION,
  FOLLOW_PLAN_DESCRIPTION,
  KEEP_IT_HERE_DESCRIPTION,
} from '@/components/layout/workspace/follow-logic-offer';
import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';

export interface FollowLogicStripProps {
  /**
   * `edit` (the default) is the event offer after an edit: Follow logic and Keep it here. `plan` is the
   * standing whole-plan offer (ADR-0216 D6): Follow logic and Dismiss, a dashed border like the
   * Arrange offer's, its own test ids, and no lead or Undo link. It is one strip with two faces, so
   * the busy, failed and shaded states cannot drift apart.
   */
  variant?: 'edit' | 'plan';
  /**
   * The sentence to show NOW: the ask, then "Moving …" while the write and the recalculation run, then
   * the failure when one broke. The workspace announced the ask when this first mounted, and
   * announces a failure itself.
   */
  message: string;
  /**
   * `idle` asks; `busy` is a write in flight (both buttons `aria-disabled`, presses ignored, focus
   * kept: no double-submit); `failed` says why and offers **Try again** in Follow logic's place.
   */
  phase?: 'idle' | 'busy' | 'failed';
  /** Called once when this is first on screen, so the host can announce it then and not before. */
  onShown?: (() => void) | undefined;
  /**
   * The Link tool's confirmation, when the tool is still armed and showing it. The confirmation is
   * carried by this strip rather than hidden behind it (ADR-0216 D5): an armed tool's band outranks
   * every lower dock strip, so a separate offer would never be seen after a link.
   */
  lead?: string | undefined;
  /** The link's own Undo, labelled **Undo link** so it is not read as undoing the move; only with `lead`. */
  onUndo?: (() => void) | undefined;
  /** Let the named bars follow their logic. The host takes the offer and writes. */
  onFollow: () => void;
  /** "Keep it here" (or "Dismiss", in the plan variant): the offer goes and nothing is written. */
  onKeep: () => void;
  /**
   * Why Follow logic is shut right now, or `null` (the Late-start overlay is read-only). Printed in
   * the strip and described to the button, so a mouse, a keyboard and a finger can all read it
   * (ADR-0204): a press on the shaded button does nothing.
   */
  followReason?: string | null | undefined;
  /**
   * Where focus goes when the strip goes. Every button here removes the strip that holds it, so
   * without a destination focus falls to `<body>` — WCAG 2.4.3, and on this workspace it also
   * silently disables every accelerator (ADR-0135, ADR-0149 D8). The buttons focus it BEFORE they
   * act; the rest (the strip withdrawn by the next edit, an undo or `Ctrl+Z` with focus on a
   * button) is `useContainerUnmountHandoff`. The canvas listbox in the diagram, the grid in the Gantt.
   */
  restoreTarget: () => HTMLElement | null;
}

/**
 * **The edit offer** (placed-bar-follows-link M2, ADR-0216): an edit just left a bar you placed
 * before its logic allows, and this offers to let it follow, or to keep it where it is.
 *
 * **No `role`, and no timer.** The workspace announced the sentence once through the app's single
 * polite region when the offer was raised (ADR-0132: an event, and a strip that mounts with its
 * content is the unreliable case for a live region), and the offer lasts until the next edit, undo or
 * redo, a press, or the pen going — never a clock (WCAG 2.2.1), the `LayoutResolvedStrip` precedent
 * and not `HistoryResultStrip`'s 15 s.
 *
 * **It takes a line of its own when it does not fit** (`messageFit="wrap"`, comfortable density and
 * the `data-dock-row` marker the dock outlet reads for its 36 rem floor): the sentence is never
 * truncated, because truncating it hides the one thing it says — which bar. The 1024 px dock's
 * message area is about 350 px and the two buttons alone take 200 of it, so no shortening of the copy
 * could fit it beside the facts (`docs/specs/placed-bar-follows-link/m0-measurement.md`, C12).
 */
export function FollowLogicStrip({
  variant = 'edit',
  message,
  phase = 'idle',
  onShown,
  lead,
  onUndo,
  onFollow,
  onKeep,
  followReason,
  restoreTarget,
}: FollowLogicStripProps): React.ReactElement {
  const reasonId = useId();
  const followId = useId();
  const keepId = useId();
  const { wrapperProps } = useContainerUnmountHandoff({ target: restoreTarget });
  // Said once, when the strip is actually here: a higher-ranked band can hide an offer that was just
  // raised, and the host remembers it has spoken, so a remount between the dock's two places is silent.
  useEffect(() => {
    onShown?.();
  }, [onShown]);
  const busy = phase === 'busy';
  const failed = phase === 'failed';
  const plan = variant === 'plan';
  const shaded = followReason != null;
  // Printed and wired in EVERY phase: the button can be shaded by the overlay whether it is asking,
  // busy or offering Try again, and a shaded control says why to every input (ADR-0204).
  const reasonShown = shaded;
  // The press is ignored while shaded or busy, and focus stays where it is (an `aria-disabled`
  // control, not a native `disabled` one, ADR-0082 and ADR-0204).
  const followShut = shaded || busy;
  // The confirmation leads only while the offer is asking: once Follow logic has been pressed the
  // sentence is about the move.
  const sentence =
    lead === undefined || phase !== 'idle'
      ? message
      : `${lead.replace(/\.$/, '')} — but ${message}`;
  return (
    // `contents`: the wrapper the hook needs is not a box, so the strip lays out exactly as before.
    <div className="contents" {...wrapperProps}>
      <NoticeStrip
        data-testid={plan ? 'canvas-follow-logic-plan-offer' : 'canvas-follow-logic-offer'}
        data-phase={phase}
        data-dock-row=""
        tone={failed ? 'warning' : 'muted'}
        emphasis={plan ? 'dashed' : 'solid'}
        density="comfortable"
        messageFit="wrap"
        message={
          reasonShown ? (
            <>
              {sentence} <span id={reasonId}>{followReason}</span>
            </>
          ) : (
            sentence
          )
        }
      >
        {lead !== undefined && onUndo !== undefined && phase === 'idle' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              restoreTarget()?.focus();
              onUndo();
            }}
          >
            Undo link
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid={plan ? 'canvas-follow-logic-plan' : 'canvas-follow-logic'}
          aria-disabled={followShut}
          aria-describedby={reasonShown ? reasonId : followId}
          onClick={(event) => {
            if (followShut) {
              event.preventDefault();
              return;
            }
            // Focus is NOT moved first: the strip stays up while the write runs, so a failure leaves
            // the planner where they pressed. When it is replaced by the confirmation the container
            // hand-off puts focus on the plan surface (ADR-0135).
            onFollow();
          }}
        >
          {failed ? 'Try again' : 'Follow logic'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-disabled={busy}
          aria-describedby={keepId}
          onClick={(event) => {
            if (busy) {
              event.preventDefault();
              return;
            }
            restoreTarget()?.focus();
            onKeep();
          }}
        >
          {plan ? 'Dismiss' : 'Keep it here'}
        </Button>
        {/* What each choice does, for a screen reader: the visible copy is the spec's, verbatim. */}
        <span id={followId} className="sr-only">
          {plan ? FOLLOW_PLAN_DESCRIPTION : FOLLOW_LOGIC_DESCRIPTION}
        </span>
        <span id={keepId} className="sr-only">
          {plan ? DISMISS_PLAN_DESCRIPTION : KEEP_IT_HERE_DESCRIPTION}
        </span>
      </NoticeStrip>
    </div>
  );
}
