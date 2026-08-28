import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { clampAnchor, portalTarget, useMeasuredBox } from '@/components/ui/overlay-position';

/**
 * A hand-rolled **tooltip** (WAI-ARIA APG tooltip pattern) on semantic HTML — the `menu.tsx` /
 * `combobox.tsx` precedent, no library (fix-slice M-B; TECH_DEBT #131, #204(a); ADR-0117).
 *
 * **A hook, not a wrapper component**, for `usePopoverPanel`'s stated reason: the trigger differs
 * per consumer, and a `<Tooltip>{children}</Tooltip>` wrapper needs `cloneElement` and a ref it
 * cannot type. Spread {@link TooltipApi.triggerProps} onto the trigger and render
 * {@link TooltipApi.tooltip} anywhere in the same JSX.
 *
 * **WCAG 1.4.13, all three clauses, each with a test:**
 * - **Dismissible** — Escape closes it with focus unmoved, via `preventDefault()` ONLY: that is
 *   what suppresses a modal `<dialog>`'s default close (#196a) — and `stopPropagation` is
 *   deliberately absent, because a tooltip arms from incidental hover/focus and must never
 *   withhold Escape from the deliberate consumer it was aimed at (a canvas tool, a marquee
 *   selection). One press closes the ambient tooltip AND still works the ADR-0080 ladder.
 * - **Hoverable** — the pointer may cross onto the tooltip itself; leave closes after a 150 ms
 *   grace so the gap between trigger and tip is crossable.
 * - **Persistent** — it never closes on a timer; only Escape, pointer-leave, blur or another
 *   tooltip opening close it.
 *
 * **Touch**: a long-press (500 ms, cancelled by > 8 px of movement or an early lift) opens the
 * tooltip WITHOUT firing the command — the click a released long-press would fire is swallowed in
 * `onClickCapture`. A plain tap fires the command and shows nothing (#131: a tap that does both is
 * noise). A press outside trigger and tip dismisses an open tooltip, because a touch device has no
 * Escape; a pen takes the hover path only.
 *
 * **At most one tooltip is open application-wide** (module-level token): per-instance state leaves
 * two open when the pointer crosses a gap quickly.
 *
 * **No transition, deliberately** — so `prefers-reduced-motion` is satisfied by construction
 * rather than by a media query someone must remember (the app globally reduces animation anyway).
 *
 * The panel is positioned by the one clamp and portalled by the one target
 * (`overlay-position.ts`) — M-C landed first precisely so this could not become a third copy.
 */
export interface TooltipOptions {
  /** The sentence the tooltip shows. Absent/empty ⇒ the whole mechanism is inert. */
  content: string | undefined;
  /**
   * What the tooltip is FOR, and it changes the ARIA wiring — the sharp edge of this primitive.
   * **No default, deliberately**: the caller states which case they are in, so the double-
   * announcement failure cannot be reached by omission.
   *
   * `'name-echo'`: the content restates the control's accessible name (the icon-only case). The
   *   panel is `aria-hidden` and NO `aria-describedby` is added — otherwise a screen reader says
   *   "Zoom in, Zoom in". It is a VISUAL affordance for sighted pointer/touch/keyboard users.
   * `'description'`: the content carries something the name does not. The panel is
   *   `role="tooltip"` and is linked with `aria-describedby` while open.
   */
  purpose: 'name-echo' | 'description';
  /** Suppresses the whole mechanism (e.g. a control that has a visible label). */
  disabled?: boolean | undefined;
}

export interface TooltipApi {
  /** Spread onto the trigger element. Never contains `title`. */
  triggerProps: {
    onPointerEnter: React.PointerEventHandler;
    onPointerLeave: React.PointerEventHandler;
    onPointerDown: React.PointerEventHandler;
    onPointerUp: React.PointerEventHandler;
    onPointerCancel: React.PointerEventHandler;
    onFocus: React.FocusEventHandler;
    onBlur: React.FocusEventHandler;
    onClickCapture: React.MouseEventHandler;
    ref: React.RefCallback<HTMLElement>;
    'aria-describedby'?: string;
  };
  /** The portalled node, or `null` while closed. Render it anywhere in the trigger's JSX. */
  tooltip: React.ReactNode;
}

/** Hover open delay: stops the row flickering as a pointer crosses it. Focus opens immediately —
 * a focus delay is user-hostile, because focus is deliberate. */
export const TOOLTIP_OPEN_DELAY_MS = 400;
/** Pointer-leave grace: the gap between trigger and tip must be crossable (1.4.13 Hoverable). */
export const TOOLTIP_CLOSE_GRACE_MS = 150;
/** Coarse-pointer long-press threshold — the platform's "tell me about this" gesture. */
export const TOOLTIP_LONG_PRESS_MS = 500;
/** Movement past this cancels a pending long-press (it became a scroll/drag, not a press). */
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

/** Vertical offset between the trigger's bottom edge and the tooltip. */
const TIP_OFFSET_PX = 6;
/** Pre-measurement estimate for the first paint only; the measured clamp corrects before paint. */
const TIP_ESTIMATE = { width: 120, height: 28 };

/**
 * The one-open-tooltip token: the instance handle currently on screen. A stable per-instance
 * object, acquired/released only through the two module functions below — the React compiler
 * forbids reassigning module state from inside a component, and it is right to: the mutation
 * belongs to the registry, not to any one instance.
 */
interface TipHandle {
  close: () => void;
}
let currentTip: TipHandle | null = null;

/** Opening `handle` closes whichever other tooltip is on screen — never two at once. */
function acquireTip(handle: TipHandle): void {
  if (currentTip && currentTip !== handle) currentTip.close();
  currentTip = handle;
}

/** Release the token iff `handle` holds it — a stale entry would let the next tip close a ghost. */
function releaseTip(handle: TipHandle): void {
  if (currentTip === handle) currentTip = null;
}

export function useTooltip({ content, purpose, disabled = false }: TooltipOptions): TooltipApi {
  const active = !disabled && !!content;
  const tipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [openState, setOpen] = useState<{ box: { x: number; y: number } } | null>(null);
  const open = active && openState !== null;

  // Every timer lives in a ref and is cleared in the unmount cleanup — a leaked timer fails
  // silently (the ADR-0064 leaked-hold lesson), and a tooltip is exactly the component that
  // unmounts mid-delay when a row re-renders under the pointer.
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClick = useRef(false);

  /**
   * One STABLE closure set per instance (a `useState` initializer, so it is minted exactly once):
   * everything here reaches only refs and `setOpen`, which are stable, so the handle another
   * instance stores and later calls can never be a stale render's.
   */
  const [{ clearTimers, close, handle }] = useState(() => {
    const clearTimersStable = (): void => {
      for (const t of [openTimer, closeTimer, pressTimer]) {
        if (t.current !== null) clearTimeout(t.current);
        t.current = null;
      }
    };
    const tipHandle: TipHandle = {
      close: (): void => {
        clearTimersStable();
        releaseTip(tipHandle);
        setOpen(null);
      },
    };
    return { clearTimers: clearTimersStable, close: tipHandle.close, handle: tipHandle };
  });

  // Unmounting mid-delay clears every timer AND releases the token if this instance holds it.
  useEffect(
    () => () => {
      clearTimers();
      releaseTip(handle);
    },
    [clearTimers, handle],
  );

  const reallyOpen = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    acquireTip(handle);
    setOpen({ box: { x: rect.left + rect.width / 2, y: rect.bottom + TIP_OFFSET_PX } });
  };

  const scheduleOpen = (): void => {
    if (openTimer.current !== null) return;
    if (closeTimer.current !== null) {
      // The pointer came back (trigger or tip) inside the grace — cancel the pending close.
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      reallyOpen();
    }, TOOLTIP_OPEN_DELAY_MS);
  };

  const scheduleClose = (): void => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) return;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      close();
    }, TOOLTIP_CLOSE_GRACE_MS);
  };

  const cancelPress = (): void => {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };

  // 1.4.13 Dismissible: Escape closes it, focus unmoved — and the press is NEVER withheld from
  // the rest of the application. `preventDefault()` alone, deliberately: it is what suppresses a
  // modal <dialog>'s native Escape-to-close (a default action, evaluated against
  // `defaultPrevented` — #196a), and it is what ladder rungs that defer to `defaultPrevented`
  // (ADR-0099 M4's drawer) read. `stopPropagation()` is deliberately ABSENT: a tooltip arms from
  // an incidental hover or focus, not a deliberate click, so swallowing propagation would
  // pre-empt every window/React Escape consumer — disarming a canvas tool, clearing a marquee
  // selection — for as long as a bubble happened to be open. The M-B accessibility review
  // reproduced exactly that (rest the pointer on a glyph with a tool armed; Escape only closed
  // the tooltip), which is the ADR-0064/ADR-0079 class this codebase has shipped twice: unlike
  // Menu and the popover, whose users OPENED them and expect Escape to be theirs, a tooltip is
  // ambient and must yield. So one Escape closes the tooltip AND still reaches the rung it was
  // aimed at — pinned by the ladder-interplay regression test.
  //
  // While open, a pointer press outside both trigger and tip also dismisses (a touch device has
  // no Escape and no reliable blur — the review's finding 5).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, close]);

  // The measured clamp: centre under the trigger, corrected against the tip's real box before
  // paint (the M-C leaf — a third clamp is the defect this epic exists to close).
  const box = useMeasuredBox(tipRef, openState, open);
  const width = box?.width ?? TIP_ESTIMATE.width;
  const height = box?.height ?? TIP_ESTIMATE.height;
  const position = openState
    ? clampAnchor({ x: openState.box.x - width / 2, y: openState.box.y }, width, height)
    : null;

  const triggerProps: TooltipApi['triggerProps'] = {
    ref: (el) => {
      triggerRef.current = el;
    },
    onPointerEnter: (event) => {
      if (!active) return;
      // Hover is the fine-pointer path; a touch "enter" is the finger landing, which is the
      // long-press path's job.
      if (event.pointerType === 'touch') return;
      scheduleOpen();
    },
    onPointerLeave: (event) => {
      if (!active) return;
      if (event.pointerType === 'touch') return;
      scheduleClose();
    },
    onPointerDown: (event) => {
      if (!active) return;
      // Touch ONLY. A hover-capable pen already has the 400 ms hover path, and giving it both
      // opened a 400–500 ms window where the hover path had shown the tooltip while the
      // long-press timer had not yet armed the click suppression — so a pen dwell showed the name
      // AND fired the command, contradicting the grammar (the M-B accessibility review's
      // finding 4). One input, one path.
      if (event.pointerType !== 'touch') return;
      pressOrigin.current = { x: event.clientX, y: event.clientY };
      const onMove = (move: PointerEvent): void => {
        const origin = pressOrigin.current;
        if (!origin) return;
        if (
          Math.abs(move.clientX - origin.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
          Math.abs(move.clientY - origin.y) > LONG_PRESS_MOVE_TOLERANCE_PX
        ) {
          cancelPress();
          document.removeEventListener('pointermove', onMove);
        }
      };
      document.addEventListener('pointermove', onMove);
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        document.removeEventListener('pointermove', onMove);
        // The press became "tell me about this": open, and swallow the click the lift will fire.
        suppressNextClick.current = true;
        reallyOpen();
      }, TOOLTIP_LONG_PRESS_MS);
      // The move listener must not outlive the press either way.
      const clearMove = (): void => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', clearMove);
        document.removeEventListener('pointercancel', clearMove);
      };
      document.addEventListener('pointerup', clearMove);
      document.addEventListener('pointercancel', clearMove);
    },
    onPointerUp: () => {
      // A lift before the threshold is a tap: the command proceeds and no tooltip shows.
      cancelPress();
    },
    onPointerCancel: () => {
      cancelPress();
    },
    onFocus: () => {
      // Focus is deliberate — open immediately, no delay.
      if (!active) return;
      reallyOpen();
    },
    onBlur: () => {
      if (!active) return;
      close();
    },
    onClickCapture: (event) => {
      if (!suppressNextClick.current) return;
      // A fired long-press already answered this gesture; the command must not also run.
      suppressNextClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    ...(purpose === 'description' && open ? { 'aria-describedby': tipId } : {}),
  };

  const tooltip =
    open && position
      ? createPortal(
          <div
            ref={tipRef}
            // 'name-echo' is purely visual: hiding it from AT is what prevents "Zoom in, Zoom in".
            {...(purpose === 'name-echo'
              ? { 'aria-hidden': true }
              : { role: 'tooltip', id: tipId })}
            data-tooltip=""
            style={{ position: 'fixed', left: position.left, top: position.top }}
            // 1.4.13 Hoverable: the pointer may rest ON the tooltip.
            onPointerEnter={scheduleOpen}
            onPointerLeave={scheduleClose}
            className="border-border bg-popover text-popover-foreground z-50 max-w-64 rounded-md border px-2 py-1 text-xs shadow-md"
          >
            {content}
          </div>,
          portalTarget(),
        )
      : null;

  return { triggerProps, tooltip };
}
