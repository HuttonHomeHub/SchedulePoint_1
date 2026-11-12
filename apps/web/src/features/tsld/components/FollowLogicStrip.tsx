import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';

export interface FollowLogicStripProps {
  /** The sentence the edit was announced with — one source for both channels. */
  message: string;
  /**
   * The Link tool's confirmation, when the tool is still armed and showing it. The confirmation is
   * carried by this strip rather than hidden behind it (ADR-0216 D5): an armed tool's band outranks
   * every lower dock strip, so a separate offer would never be seen after a link.
   */
  lead?: string | undefined;
  /** The link's own Undo, kept beside Follow logic; present only with `lead`. */
  onUndo?: (() => void) | undefined;
  /** Let the named bars follow their logic. The host takes the offer and writes. */
  onFollow: () => void;
  /** "Keep it here": the offer goes and nothing is written. */
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
  message,
  lead,
  onUndo,
  onFollow,
  onKeep,
  followReason,
  restoreTarget,
}: FollowLogicStripProps): React.ReactElement {
  const reasonId = useId();
  const { wrapperProps } = useContainerUnmountHandoff({ target: restoreTarget });
  const shaded = followReason != null;
  const sentence = lead === undefined ? message : `${lead} ${message}`;
  return (
    // `contents`: the wrapper the hook needs is not a box, so the strip lays out exactly as before.
    <div className="contents" {...wrapperProps}>
      <NoticeStrip
        data-testid="canvas-follow-logic-offer"
        data-dock-row=""
        tone="muted"
        density="comfortable"
        messageFit="wrap"
        message={
          shaded ? (
            <>
              {sentence} <span id={reasonId}>{followReason}</span>
            </>
          ) : (
            sentence
          )
        }
      >
        {lead !== undefined && onUndo !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              restoreTarget()?.focus();
              onUndo();
            }}
          >
            Undo
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="canvas-follow-logic"
          aria-disabled={shaded}
          {...(shaded ? { 'aria-describedby': reasonId } : {})}
          onClick={(event) => {
            if (shaded) {
              event.preventDefault();
              return;
            }
            restoreTarget()?.focus();
            onFollow();
          }}
        >
          Follow logic
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            restoreTarget()?.focus();
            onKeep();
          }}
        >
          Keep it here
        </Button>
      </NoticeStrip>
    </div>
  );
}
