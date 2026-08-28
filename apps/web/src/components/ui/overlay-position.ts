import { useLayoutEffect, useState } from 'react';

/**
 * **The one viewport clamp and the one portal target for positioned overlays** (TECH_DEBT #203(b)).
 *
 * Extracted verbatim from `menu.tsx` (2026-08-28, fix-slice M-C). `usePopoverPanel` carried a
 * second, estimate-only copy of this arithmetic — it never measured, so a panel taller than its
 * guess overflowed the viewport with its lower controls pointer-unreachable — and `#196a`'s
 * Escape fix had already had to be made in two files because the contract existed twice. One leaf
 * is the ADR-0065 argument: two implementations drift, and the drift is invisible because each
 * looks right alone.
 */

export interface OverlayAnchor {
  /** Viewport x (px) — the overlay's inline-start edge, clamped to stay on-screen. */
  x: number;
  /** Viewport y (px) — the overlay's block-start edge, clamped to stay on-screen. */
  y: number;
}

/**
 * The margin kept between an overlay and the viewport edge.
 *
 * **An estimate box was the only number the menu ever used, and that was a defect** with the shape
 * this codebase keeps recording: a control present in the DOM and unreachable by pointer. A row
 * menu opened near the bottom of the window was positioned as though it were 200 px tall; a taller
 * one ran off the viewport, and its last item — `Delete`, on every row — could be focused but not
 * clicked. That is **WCAG 2.4.11 Focus Not Obscured (Minimum, AA)**, and precisely for `Delete`
 * alone: measured, its top was already past the fold, so it was *entirely* hidden, which 2.4.11
 * prohibits. `Dissolve` above it was only partly clipped — permitted at AA, caught only by 2.4.12
 * (AAA). Stated that narrowly because this repository has recorded overstating an SC once
 * (ADR-0082) and correcting it. Found when the activities table gained a `Notes` item
 * (`docs/specs/object-bar-defects/` M2) and pushed a WBS summary's menu past 200 px, which made
 * `e2e-wbs` time out on a locator that **resolved**. Raising the constant was tried first and is
 * exactly the wrong fix: it moves the threshold and leaves the class.
 *
 * Estimates remain as the pre-measurement box because the first render has nothing to measure, and
 * an overlay that paints at the wrong place for one frame and jumps is worse than one that starts
 * close. {@link useClampedPosition} corrects them before the browser paints.
 */
export const CLAMP_MARGIN = 8;

/** Clamp an anchor so a box of `width × height` stays inside the viewport with the margin. */
export function clampAnchor(
  { x, y }: OverlayAnchor,
  width: number,
  height: number,
): { left: number; top: number } {
  const maxLeft = Math.max(CLAMP_MARGIN, window.innerWidth - width - CLAMP_MARGIN);
  const maxTop = Math.max(CLAMP_MARGIN, window.innerHeight - height - CLAMP_MARGIN);
  return {
    left: Math.min(Math.max(CLAMP_MARGIN, x), maxLeft),
    top: Math.min(Math.max(CLAMP_MARGIN, y), maxTop),
  };
}

/**
 * Clamp the overlay against its **own measured box**, not an assumed one.
 *
 * `useLayoutEffect` rather than `useEffect`: it runs after the DOM is written and **before the
 * browser paints**, so an overlay that would have overflowed is repositioned in the same frame
 * rather than appearing in the wrong place and moving.
 *
 * The dependency on `anchor` is what makes a re-open at a different row re-measure; the panel is
 * unmounted while closed (`if (!open) return null`), so there is no stale measurement to carry.
 */
export function useClampedPosition(
  panelRef: React.RefObject<HTMLElement | null>,
  anchor: OverlayAnchor,
  open: boolean,
  estimate: { width: number; height: number },
): { left: number; top: number } {
  const box = useMeasuredBox(panelRef, anchor, open);
  return clampAnchor(anchor, box?.width ?? estimate.width, box?.height ?? estimate.height);
}

/**
 * The overlay's own measured box, synced from layout before paint — `null` until measured (first
 * render, or jsdom, where every rect is zero and the estimate is the honest answer).
 */
export function useMeasuredBox(
  panelRef: React.RefObject<HTMLElement | null>,
  /**
   * Identity-compared re-measure key — the anchor object for a menu, the trigger's box for a
   * popover. What it IS does not matter to the measurement; that a fresh open mints a fresh
   * object is what makes a re-open at a different place re-measure.
   */
  remeasureKey: unknown,
  open: boolean,
): { width: number; height: number } | null {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    // **No reset on close, deliberately.** `setBox(null)` was here and `react-hooks/set-state-in-effect`
    // refused it — rightly, and the honest fix was to delete it rather than suppress the rule,
    // because it was redundant: the panel unmounts while closed, and the next open re-measures in
    // this same layout effect BEFORE paint. A carried-over box can therefore only ever be the
    // pre-measurement estimate for one commit that nobody sees — and a warm one at that.
    //
    // The `setBox` below stays, and is the case the rule's own text describes as legitimate:
    // reading from an external system (layout) and syncing it into React. The updater returns
    // `prev` unchanged when the box has not moved, so it costs one extra render per open and does
    // not cascade.
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox((prev) =>
      prev && prev.width === rect.width && prev.height === rect.height
        ? prev
        : { width: rect.width, height: rect.height },
    );
  }, [panelRef, remeasureKey, open]);

  return box;
}

/**
 * Where a positioned overlay mounts: the **topmost open modal `<dialog>`** if there is one, else
 * `document.body`.
 *
 * A modal `<dialog>` (opened with `showModal()`) lives in the browser's **top layer**, which sits
 * above the whole normal stacking context — `z-50` on a sibling of `<body>` is not merely lower, it
 * is in a different layer and no z-index can reach it. So a menu portalled to `document.body` from
 * inside a dialog renders *underneath* the dialog: visible in the DOM, entirely unclickable, and
 * silently so. Every consumer until now opened its menu from a page, which is why this went unseen
 * until a Playwright journey drove one from inside the calendar dialog and the click retried for
 * thirty seconds against "subtree intercepts pointer events".
 *
 * `position: fixed` stays viewport-relative inside a dialog (a dialog establishes no containing
 * block of its own), so the anchor maths above is unaffected. The **last** open dialog is chosen
 * because a nested one is the topmost.
 */
export function portalTarget(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return dialogs[dialogs.length - 1] ?? document.body;
}
