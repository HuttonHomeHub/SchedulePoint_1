import { useEffect, useRef, useState } from 'react';

/**
 * The shared optimistic-`<select>` state machine for the plan-level pickers (calendar, recalc mode,
 * and any future one). A picked value is held locally and shown straight away, so the control never
 * snaps back to the stale cache mid-save; it stays **busy** from the change until the invalidated plan
 * query refetches and the server truth catches up (not merely until the mutation settles), so a rapid
 * re-edit can't send a stale `version`. Focus is restored after the busy state clears — disabling the
 * focused `<select>` drops focus to `<body>`, and we refocus only if the user didn't move it elsewhere
 * (WCAG 2.4.3).
 *
 * `extraBusy` lets a caller stay busy for its own reason too (e.g. a dependent list still loading).
 * The generic `T` is the option value (`''`-for-none strings, an enum, …).
 */
export function useOptimisticSelect<T>(params: {
  serverValue: T;
  isPending: boolean;
  extraBusy?: boolean;
}): {
  /** The value to render as selected (the pending pick, else the server truth). */
  displayed: T;
  /** True while a pick is in flight or the caller is otherwise busy — disable the control. */
  busy: boolean;
  /** Attach to the `<select>` so focus can be restored after the busy state clears. */
  selectRef: React.RefObject<HTMLSelectElement | null>;
  /** Record an in-flight pick (call before firing the mutation). */
  choose: (value: T) => void;
  /** Clear the pending pick (call from the mutation's `onError` to roll back). */
  rollback: () => void;
} {
  const { serverValue, isPending, extraBusy = false } = params;
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const wasBusy = useRef(false);
  // The just-picked value, shown until the refetched plan confirms it (or a failure rolls it back);
  // null means "no pending choice".
  const [optimistic, setOptimistic] = useState<T | null>(null);

  // Drop the optimistic value once the server truth catches up — the documented "reset state during
  // render" pattern (no effect, no extra committed render).
  if (optimistic !== null && optimistic === serverValue) setOptimistic(null);

  const busy = isPending || extraBusy || (optimistic !== null && optimistic !== serverValue);
  const displayed = optimistic ?? serverValue;

  // Disabling the focused select drops focus to <body>; restore it once busy clears (WCAG 2.4.3),
  // but only if focus was actually lost (not moved away by the user).
  useEffect(() => {
    if (
      wasBusy.current &&
      !busy &&
      (document.activeElement === document.body || document.activeElement === null)
    ) {
      selectRef.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

  return {
    displayed,
    busy,
    selectRef,
    choose: (value: T) => setOptimistic(value),
    rollback: () => setOptimistic(null),
  };
}
