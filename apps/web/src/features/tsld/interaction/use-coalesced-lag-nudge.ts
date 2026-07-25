import type { DependencySummary } from '@repo/types';
import { useEffect, useRef } from 'react';

import type { TsldEditOutcome, TsldLagInput } from '../components/TsldPanel';
import { lagPhrase } from '../render/a11y';

import { NUDGE_DEBOUNCE_MS } from './use-coalesced-nudge';

/** Serialize retry interval (ms): re-attempt the commit while a prior write is still in flight. */
const SERIALIZE_RETRY_MS = 40;

/** The accumulating optimistic target of an in-progress lag nudge (ADR-0052 M3). */
interface LagTarget {
  dependencyId: string;
  /** Endpoint names + type/calendar snapshotted for the announcement (they never change here). */
  predecessorName: string;
  successorName: string;
  type: DependencySummary['type'];
  lagCalendar: DependencySummary['lagCalendar'];
  /** The absolute tentative signed lag (whole days; negative = lead). */
  lagDays: number;
}

/**
 * Diff the absolute target against the *live persisted* row → the minimal lag input, or `null`
 * when props have already caught up (no write needed) or the dependency has vanished. Pure so the
 * serialized `commit` and the unmount flush share identical semantics (the sibling
 * `use-coalesced-duration-nudge` pattern).
 */
function buildLag(t: LagTarget, dependencies: readonly DependencySummary[]): TsldLagInput | null {
  const persisted = dependencies.find((d) => d.id === t.dependencyId);
  if (!persisted) return null; // the link was removed elsewhere — nothing to write
  if (t.lagDays === persisted.lagDays) return null; // props caught up — no-op
  return { dependencyId: t.dependencyId, lagDays: t.lagDays };
}

export interface CoalescedLagNudgeDeps {
  onLag: ((input: TsldLagInput) => Promise<TsldEditOutcome>) | undefined;
  dependencies: readonly DependencySummary[];
  announce: (message: string) => void;
}

/**
 * Coalesced keyboard **lag** nudge (ADR-0052 M3, WCAG 2.1.1/2.5.7): the `Shift+←/→` equivalent of
 * the canvas lag-anchor drag. The canvas has no per-dependency keyboard surface (its parallel
 * listbox lists *activities*), so this hook is composed by the route into the **Logic panel's**
 * dependency rows — the existing dependencies keyboard surface — where a focused row's action
 * buttons take the chord. Exactly like the sibling `useCoalescedDurationNudge`, it accumulates the
 * **absolute** target lag across a burst, debounces the commit, and **serializes** writes so a
 * held key is ONE minimal PATCH read at the live version. No clamp: negative is a lead (the
 * server DTO bounds extremes, surfaced as a conflict). No ghost/banner — the Logic panel is a
 * modal table, so both the running value and any conflict are **announced** instead. A pending
 * nudge is flushed on unmount rather than dropped. Returns the `nudge(dependency, delta)` handler.
 */
export function useCoalescedLagNudge(
  deps: CoalescedLagNudgeDeps,
): (dependency: DependencySummary, delta: number) => void {
  const depsRef = useRef(deps);
  // Keep the latest deps in a ref so the debounced/serialized commit never runs against a stale
  // closure. Updated in an effect (not during render) so refs aren't written mid-render.
  useEffect(() => {
    depsRef.current = deps;
  });
  const targetRef = useRef<LagTarget | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  // The in-flight write's settled chain (or null when idle), awaited by the unmount flush so a
  // delta queued *behind* an in-flight write isn't dropped (the #25c fix, inherited).
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const commit = (): void => {
    const t = targetRef.current;
    const { onLag, dependencies, announce } = depsRef.current;
    if (!t || !onLag) {
      targetRef.current = null;
      return;
    }
    // Serialize: never read a version while the previous burst's write/invalidation is in flight.
    if (busyRef.current) {
      timerRef.current = setTimeout(commit, SERIALIZE_RETRY_MS);
      return;
    }
    const input = buildLag(t, dependencies);
    if (!input) {
      targetRef.current = null;
      return; // removed elsewhere, or props caught up — no write needed
    }
    const finalLag = t.lagDays;
    const { predecessorName, successorName, type, lagCalendar } = t;
    busyRef.current = true;
    inFlightRef.current = onLag(input)
      .then((outcome) => {
        if (!mountedRef.current) return;
        if (outcome.conflict) {
          // The Logic panel has no conflict banner — speak it (the dialogs re-read live rows).
          announce(outcome.conflict);
          targetRef.current = null; // truth wins — re-seed from props on the next nudge
        }
        if (outcome.applied) {
          // NB: targetRef deliberately survives here (the absolute-target cross-burst rule the
          // sibling hooks document), so a fast follow-up nudge extends from it, not a stale prop.
          const phrase = lagPhrase({ type, lagDays: finalLag, lagCalendar });
          announce(
            `Set the link “${predecessorName}” → “${successorName}” to ${phrase}${
              finalLag === 0 ? ' (no lag)' : ''
            }; dates will update.`,
          );
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        announce(err instanceof Error ? err.message : 'Couldn’t change the link’s lag.');
        targetRef.current = null;
      })
      .finally(() => {
        busyRef.current = false;
        inFlightRef.current = null;
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!targetRef.current) return;
      // Flush a queued nudge so a pending edit isn't silently dropped on unmount / plan switch.
      const flushFinal = (): void => {
        const t = targetRef.current;
        const { onLag, dependencies } = depsRef.current;
        if (!t || !onLag) return;
        const input = buildLag(t, dependencies);
        targetRef.current = null;
        if (input) void onLag(input).catch(() => {});
      };
      const inFlight = inFlightRef.current;
      if (busyRef.current && inFlight) void inFlight.then(flushFinal, flushFinal);
      else flushFinal();
    };
    // All mutable state is in refs read live via depsRef, so the empty deps array is correct.
  }, []);

  return (dependency, delta) => {
    const { onLag } = depsRef.current;
    if (!onLag) return;
    let t = targetRef.current;
    if (!t || t.dependencyId !== dependency.id) {
      // Switching links mid-burst — flush the previous target before starting a new one.
      if (t) {
        if (timerRef.current) clearTimeout(timerRef.current);
        commit();
      }
      t = {
        dependencyId: dependency.id,
        predecessorName: dependency.predecessor.name,
        successorName: dependency.successor.name,
        type: dependency.type,
        lagCalendar: dependency.lagCalendar,
        lagDays: dependency.lagDays,
      };
      targetRef.current = t;
    }
    t = { ...t, lagDays: t.lagDays + delta };
    targetRef.current = t;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(commit, NUDGE_DEBOUNCE_MS);
  };
}
