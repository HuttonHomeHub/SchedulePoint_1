import { useCallback, useLayoutEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * **A container that goes away hands focus on, and says so** (ADR-0135 for a container, where
 * `useToolbarFocusHandoff` is for an item). **Three components use it:** the diagram viewport cluster
 * (`diagram-viewport-cluster.tsx`), `PanelResizer`'s size box (`panel-resizer.tsx`) and
 * `HistoryResultStrip`, which hands on to the plan surface with a function `target` and no
 * `message`. The toolbar-redesign M4 review counted three hand-written copies of this rule;
 * `SelectionActionsBar` still keeps the last (`docs/TECH_DEBT.md` #481).
 *
 * It cannot be an effect on the toolbar's own item list: when the container itself unmounts no effect
 * body runs in that commit (`use-focus-handoff.ts` records this). So the **wrapper** the caller puts
 * around the container spreads what this returns, and the hook's layout-effect *cleanup* is what
 * runs at the unmount.
 *
 * ## How "focus was inside" is decided
 *
 * - **While the wrapper is still in the document, ask the document**: `activeElement` inside it. A
 *   flag that is only ever cleared by a blur with a related target stays true after a click on blank
 *   canvas (a blur with `relatedTarget === null`), and a later unmount for an unrelated reason then
 *   yanks focus from wherever the reader actually is.
 * - **When the wrapper has already been taken out of the document, ask the record.** A portal whose
 *   host node is removed by the same commit that unmounts its owner (the diagram leaving for the
 *   Gantt) is detached before this cleanup runs, the browser has already dropped focus to `<body>`,
 *   and `activeElement` has no answer left. The record is a boolean kept by capture-phase focus
 *   events; a blur with no related target is **re-read one frame later**, because that is exactly the
 *   shape both a removal and a click on blank space take, and only the first leaves the wrapper
 *   disconnected.
 * - Either way the hand-off acts **only if focus was dropped** (`activeElement` is `<body>`), so a
 *   reader who moved on is never pulled back.
 *
 * Focus first, then announce, and announce only if the focus actually landed (`use-focus-handoff.ts`:
 * the announcer defers its write by a frame, so the other order has the screen reader read the newly
 * focused control over the sentence).
 */
export function useContainerUnmountHandoff({
  target,
  message,
}: {
  /**
   * The control that takes focus: a selector, or a function for a destination that is a decision
   * rather than a selector (the plan surface). Either is resolved at unmount, because the control
   * may not exist earlier; a function that answers `null` hands nothing on.
   */
  target: string | (() => HTMLElement | null);
  /**
   * Said through the polite region once focus has landed. Absent means focus moves and nothing is
   * said, for a container whose removal something else has already announced (ADR-0132).
   */
  message?: string;
}): {
  /** Spread onto the wrapper the caller puts around the container: `<div {...wrapperProps}>`. */
  wrapperProps: {
    ref: (node: HTMLElement | null) => void;
    onFocusCapture: () => void;
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => void;
  };
  /**
   * Whether focus was inside when it was last recorded — the same record the unmount cleanup reads,
   * for a caller whose container STAYS mounted while a control inside it goes (ADR-0135's per-item
   * case). Kept beside `wrapperProps`, not among them, so spreading the wrapper's props can never
   * put a function on a DOM node.
   *
   * **The record can be stale-true for one frame.** A click on blank space blurs with no related
   * target, which the record cannot tell from a removal until the next frame re-reads it, so a
   * caller that asks in that window (and the control then vanishes) hands focus on once more than
   * the reader meant. Narrow, and accepted: the destination is the plan surface, not a surprise.
   */
  focusWasInside: () => boolean;
} {
  const announce = useAnnounce();
  const latest = useRef({ target, message, announce });
  const wrapper = useRef<HTMLElement | null>(null);
  const recorded = useRef(false);
  const frame = useRef<number | null>(null);

  useLayoutEffect(() => {
    latest.current = { target, message, announce };
  }, [target, message, announce]);

  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      const node = wrapper.current;
      const inside = node?.isConnected ? node.contains(document.activeElement) : recorded.current;
      if (!inside) return;
      // A reader who moved on keeps their place; only a dropped focus is handed on. Focus still on a
      // control of the wrapper counts: the wrapper is about to go and takes it with it.
      const active = document.activeElement;
      const dropped = active === null || active === document.body || !!node?.contains(active);
      if (!dropped) return;
      const { target: wanted, message: sentence, announce: say } = latest.current;
      const destination =
        typeof wanted === 'function' ? wanted() : document.querySelector<HTMLElement>(wanted);
      if (!destination) return;
      destination.focus();
      if (document.activeElement !== destination) return;
      if (sentence !== undefined) say(sentence);
    },
    [],
  );

  const ref = useCallback((node: HTMLElement | null) => {
    if (node !== null) wrapper.current = node;
  }, []);

  const onFocusCapture = useCallback(() => {
    recorded.current = true;
  }, []);

  const onBlurCapture = useCallback((event: React.FocusEvent<HTMLElement>) => {
    // A move to another element ends "inside" at once.
    if (event.relatedTarget !== null) {
      recorded.current = false;
      return;
    }
    // No related target: a removal, or focus dropped onto blank space. A frame later the wrapper
    // tells them apart — a removed one is no longer in the document.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const node = wrapper.current;
      if (node?.isConnected && !node.contains(document.activeElement)) recorded.current = false;
    });
  }, []);

  const focusWasInside = useCallback(() => recorded.current, []);

  return { wrapperProps: { ref, onFocusCapture, onBlurCapture }, focusWasInside };
}
