import { useEffect, useState } from 'react';

/**
 * The wall clock, re-read on an interval so a relative time ("2 minutes ago") stays true without a
 * request. The instant is state rather than a `new Date()` in render, which would be a different
 * answer on every render and would make a test of the text depend on when it ran.
 *
 * It moved here from the staff console's header when the Performance box's one-line summary needed
 * the same clock (staff console redesign M4): `features/perf-probe` may not import `features/staff`.
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
