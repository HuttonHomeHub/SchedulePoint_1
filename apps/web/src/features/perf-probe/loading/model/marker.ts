import type { Limb } from './limb';

/**
 * The state carried across the probe's two navigations, in `sessionStorage` (per tab, so a press in
 * one tab cannot steer another).
 *
 * **Static and tiny on purpose.** The staff screen must know whether a run is pending without
 * importing the runner, which is a split point (`panel-imports.structural.test.ts`). Everything the
 * screen needs to ask that question lives here; everything that measures lives in the runner.
 */
export const LOADING_MARKER_KEY = 'schedulepoint.staff.loading-probe';

/** A press takes ~10-20 s. Anything older was interrupted, and resuming it would measure a stale cycle. */
export const MARKER_MAX_AGE_MS = 2 * 60 * 1000;

export type MarkerStep = 'reload' | 'revisit';

export interface LoadingMarker {
  readonly v: 1;
  readonly runId: string;
  readonly startedAt: number;
  readonly step: MarkerStep;
  /** The reload limb and the URLs it observed, carried to the revisit page. */
  readonly reload?: Limb;
  readonly urls?: readonly string[];
}

export type MarkerRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'discarded'; readonly reason: 'malformed' | 'expired' }
  | { readonly kind: 'pending'; readonly marker: LoadingMarker };

/**
 * Parse defensively: the value is whatever a previous document, an extension or a person left in
 * storage, and a malformed one is discarded rather than trusted.
 */
export function readMarker(storage: Pick<Storage, 'getItem'>, now: number): MarkerRead {
  let raw: string | null;
  try {
    raw = storage.getItem(LOADING_MARKER_KEY);
  } catch {
    return { kind: 'none' };
  }
  if (raw === null) return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'discarded', reason: 'malformed' };
  }
  if (!isMarker(parsed)) return { kind: 'discarded', reason: 'malformed' };
  if (now - parsed.startedAt > MARKER_MAX_AGE_MS || parsed.startedAt > now + 1000) {
    return { kind: 'discarded', reason: 'expired' };
  }
  return { kind: 'pending', marker: parsed };
}

function isMarker(value: unknown): value is LoadingMarker {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (m.v !== 1 || typeof m.runId !== 'string' || typeof m.startedAt !== 'number') return false;
  if (!Number.isFinite(m.startedAt)) return false;
  if (m.step === 'reload') return true;
  // The revisit step is only meaningful with the first limb and its URLs in hand.
  return (
    m.step === 'revisit' &&
    isLimb(m.reload) &&
    Array.isArray(m.urls) &&
    m.urls.every((u) => typeof u === 'string')
  );
}

function isLimb(value: unknown): value is Limb {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  if (l.name !== 'reload') return false;
  if (l.status === 'not-taken') return typeof l.reason === 'string';
  if (l.status !== 'taken' && l.status !== 'incomplete') return false;
  const t = l.tally as Record<string, unknown> | null | undefined;
  return (
    typeof l.readyMs === 'number' &&
    typeof t === 'object' &&
    t !== null &&
    ['observed', 'cache', 'revalidated', 'downloaded', 'notExposed', 'heuristic'].every(
      (k) => typeof t[k] === 'number',
    ) &&
    Array.isArray(t.protocols)
  );
}
