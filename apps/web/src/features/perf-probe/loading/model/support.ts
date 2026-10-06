/**
 * Whether this browser can take the measurement at all, decided before anything is offered.
 *
 * The probe needs `sessionStorage` to carry its state across two navigations, and Resource Timing
 * (with a settable buffer and its observer interface) to read what the browser fetched. A browser
 * without them would reload the page and then report nothing, which is a worse answer than saying
 * so first. `sessionStorage` is probed with a write, not a property read: a private-mode or
 * policy-blocked store exists and throws on use.
 */
export const UNSUPPORTED_SENTENCE =
  'This browser can’t take this measurement — use Chrome or Edge.';

export function unsupportedReason(win: Window = window): string | null {
  try {
    const probe = 'schedulepoint.staff.loading-probe.support';
    win.sessionStorage.setItem(probe, '1');
    win.sessionStorage.removeItem(probe);
  } catch {
    return UNSUPPORTED_SENTENCE;
  }
  const perf = win.performance as Partial<Performance> | undefined;
  if (
    typeof (win as { PerformanceObserver?: unknown }).PerformanceObserver === 'undefined' ||
    typeof perf?.getEntriesByType !== 'function' ||
    typeof perf.setResourceTimingBufferSize !== 'function'
  ) {
    return UNSUPPORTED_SENTENCE;
  }
  return null;
}
