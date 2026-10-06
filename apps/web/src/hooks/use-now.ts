import { useEffect, useState } from 'react';

/**
 * The wall clock, re-read on an interval so a relative time ("2 minutes ago") stays true without a
 * request. The instant is state rather than a `new Date()` in render, which would be a different
 * answer on every render and would make a test of the text depend on when it ran.
 *
 * It moved here from the staff console's header when the Performance box's one-line summary needed
 * the same clock (staff console redesign M4): `features/perf-probe` may not import `features/staff`.
 *
 * **Not the canvas's `useNow`.** `features/tsld/render/use-now.ts` exports a same-named hook that
 * returns a step-rounded `number` for the diagram; this one returns a `Date` for page copy. Import
 * this one from `@/hooks/use-now`.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
