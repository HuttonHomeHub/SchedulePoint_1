import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  acknowledgeNotice,
  dismissNoticeForVisit,
  readNoticeMemory,
  subscribeNoticeMemory,
} from './viewport-notice-ack';

import { useMediaQuery } from '@/components/ui/use-media-query';
import { DESIGNED_MIN_WIDTH_QUERY } from '@/lib/breakpoints';

/**
 * How long the window must stay below the floor before the banner appears. A window dragged across
 * 1024 crosses it repeatedly in a second; without this the strip would flicker in and out under the
 * reader's pointer. There is deliberately **no hysteresis band** (ADR-0179): a debounce answers
 * "has it settled" and a band would answer "how far did it go", and nothing here needs the second.
 */
export const BANNER_DEBOUNCE_MS = 300;

export const BANNER_TEXT = 'This window is narrower than SchedulePoint is designed for';

export interface ViewportNoticeState {
  /** The full-screen page is open: a load or a pathname change, while narrow and unanswered. */
  pageOpen: boolean;
  /** The slim banner is showing: a live narrowing, settled, with no pointer button down. */
  bannerVisible: boolean;
  /** *Continue anyway* — remembered on this device. */
  continueAnyway: () => void;
  /** *Dismiss*, Escape or a native close — this visit only. */
  dismissForVisit: () => void;
}

/**
 * **When the viewport notice speaks** (ADR-0179, spec §2.2). One decision, made here, so the page
 * and the banner cannot both be up and cannot disagree about whether the reader has answered.
 *
 * - **The page** is decided on a **load** and on a **pathname** change — and only then. A search
 *   param is not a navigation here (selecting an activity, switching view: ADR-0123), and a media
 *   change is not either: a modal that opened because the window was dragged would steal focus
 *   from a field in the middle of an edit. It closes by itself on widening, storing nothing.
 * - **The banner** is what a live narrowing gets instead: after {@link BANNER_DEBOUNCE_MS} below the
 *   floor and never while a pointer button is down (a banner appearing under a drag moves the
 *   thing being dragged). It hides at once on widening.
 *
 * The page's "open" state is adjusted **during render** from the pathname and the media query
 * (React's documented pattern for state derived from props) rather than in an effect, so the
 * `showModal()` that follows runs in the same commit and a narrow load never paints the shell.
 */
export function useViewportNotice(): ViewportNoticeState {
  const narrow = !useMediaQuery(DESIGNED_MIN_WIDTH_QUERY, true);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const memory = useSyncExternalStore(subscribeNoticeMemory, readNoticeMemory, () => null);
  const answered = memory !== null;

  const [gate, setGate] = useState<{ path: string | null; open: boolean }>({
    path: null,
    open: false,
  });
  let pageOpen = gate.open;
  if (gate.path !== pathname) {
    pageOpen = narrow && !answered;
    setGate({ path: pathname, open: pageOpen });
  } else if (gate.open && (!narrow || answered)) {
    pageOpen = false;
    setGate({ path: pathname, open: false });
  }

  const eligible = narrow && !answered && !pageOpen;
  const bannerVisible = useBannerReveal(eligible);

  return {
    pageOpen,
    bannerVisible: eligible && bannerVisible,
    continueAnyway: acknowledgeNotice,
    dismissForVisit: dismissNoticeForVisit,
  };
}

/**
 * Whether `eligible` has held for the debounce with no pointer button down. The returned flag is
 * only ever ANDed with `eligible` by the caller, so widening hides the banner on that very render
 * and this state catches up in the effect's cleanup.
 */
function useBannerReveal(eligible: boolean): boolean {
  const [revealed, setRevealed] = useState(false);
  const pointerDown = useRef(false);

  useEffect(() => {
    const down = (): void => {
      pointerDown.current = true;
    };
    const up = (event: PointerEvent): void => {
      pointerDown.current = event.buttons !== 0;
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  useEffect(() => {
    if (!eligible) return;
    const settle = (): void => {
      if (pointerDown.current) {
        // A button is down: try again the moment it is released, not on a clock.
        window.addEventListener('pointerup', settle, { once: true });
        window.addEventListener('pointercancel', settle, { once: true });
        return;
      }
      setRevealed(true);
    };
    const timer = window.setTimeout(settle, BANNER_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerup', settle);
      window.removeEventListener('pointercancel', settle);
      setRevealed(false);
    };
  }, [eligible]);

  return revealed;
}
