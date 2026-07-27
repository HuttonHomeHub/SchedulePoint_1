import { useEffect, useState } from 'react';

/**
 * A monotonically-increasing counter that bumps every `stepMs` while the tab is **visible**,
 * pausing entirely while `document.hidden` and re-syncing immediately on `visibilitychange` (the
 * Today marker's staleness decision, feature-spec.md §4.6(c) — periodic tick, with the
 * visibility-only repaint folded in). Consumers re-derive whatever wall-clock value they need
 * (`todayIso`, `todayDayFraction`) off a fresh `Date.now()` on every bump; this hook owns only the
 * "when to re-derive" cadence, never the value itself, so it stays trivially fake-timer-testable
 * (CLAUDE.md §7 — no suite depends on the wall clock).
 *
 * Bounded to one repaint per interval per open, **visible** plan: at the default 60s step and the
 * `VITE_CANVAS_TIME_AXIS` `MAX_PX_PER_DAY = 200`, one minute is 0.14px, so the marker is never
 * visibly stale, at a 0.007% duty cycle against a ≤4ms p95 frame (ADR-0026).
 *
 * This also repairs a pre-existing latent defect: the previous whole-day `todayOffset` was
 * equally frozen, so a plan left open across midnight already showed yesterday's line until
 * something unrelated dirtied the scene — the tick fixes both.
 *
 * SSR-safe: on the server (or before mount) there is no `document`, so the timer simply never
 * arms; the counter starts at `0` and stays there until the effect runs client-side.
 */
export function useNow(stepMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(() => setTick((t) => t + 1), stepMs);
    };
    const stop = () => {
      if (id == null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Re-sync immediately on becoming visible (option C folded into A), then resume ticking.
        setTick((t) => t + 1);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [stepMs]);
  return tick;
}
