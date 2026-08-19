/**
 * The plans this browser has opened, per account and per organisation (ADR-0098 §4.9).
 *
 * **Pure over an injected `Storage`.** Nothing here reads a global, so the whole model is testable
 * without a browser and cannot acquire a hidden dependency on one. Callers pass
 * `window.localStorage`; tests pass a map, or something that throws.
 *
 * **Two properties are load-bearing and both were named when this was approved.**
 *
 * The key carries the **user id**. Without it a shared machine hands the second account the first
 * account's plan names — commercially sensitive strings, on the first screen after sign-in, caused
 * by nothing anyone did. Sign-out clears that account's entries, which closes the same case from
 * the other end.
 *
 * The store holds **ids and a timestamp, never a name.** This is the half that makes the section
 * honest: names come from the server on every load, so a rename corrects itself, a deleted plan
 * vanishes, and a plan the reader has lost access to disappears silently. A cached name would do
 * none of those — and the one occasion it would be used is the one occasion nobody has checked it.
 */

/** How many plans a browser remembers per organisation. */
export const RECENT_PLANS_CAP = 5;

const PREFIX = 'schedulepoint-recent-plans';

interface RecentEntry {
  id: string;
  /** Epoch milliseconds, for ordering. Kept so the shape can be pruned by age later. */
  at: number;
}

function keyFor(userId: string, orgSlug: string): string {
  return `${PREFIX}:${userId}:${orgSlug}`;
}

/**
 * Every read and write goes through these two, so an unavailable `localStorage` (private mode, a
 * disabled store, a quota error) degrades to "the section is absent" rather than to an error on the
 * landing page — the `lib/active-org.ts:8-22` precedent.
 */
function read(storage: Storage, key: string): RecentEntry[] {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentEntry).id === 'string' &&
        typeof (entry as RecentEntry).at === 'number',
    );
  } catch {
    // Someone else's data, or ours from a future shape. Treated as nothing rather than as an
    // error: this is a convenience, and there is no state here worth recovering.
    return [];
  }
}

function write(storage: Storage, key: string, entries: RecentEntry[]): void {
  try {
    storage.setItem(key, JSON.stringify(entries));
  } catch {
    /* unavailable or full — the section is simply absent next time. */
  }
}

/**
 * Record that this account opened this plan in this organisation, now.
 *
 * Re-opening a remembered plan **moves** it to the front rather than adding a second entry, so the
 * list is five distinct plans rather than five visits.
 */
export function rememberPlan(
  storage: Storage,
  { userId, orgSlug, planId, at }: { userId: string; orgSlug: string; planId: string; at: number },
): void {
  const key = keyFor(userId, orgSlug);
  const without = read(storage, key).filter((entry) => entry.id !== planId);
  write(storage, key, [{ id: planId, at }, ...without].slice(0, RECENT_PLANS_CAP));
}

/** The remembered ids, most recent first. Empty when there is nothing, or nowhere to keep it. */
export function readRecentPlanIds(
  storage: Storage,
  { userId, orgSlug }: { userId: string; orgSlug: string },
): string[] {
  return read(storage, keyFor(userId, orgSlug))
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_PLANS_CAP)
    .map((entry) => entry.id);
}

/**
 * Drop remembered ids the server did not hand back.
 *
 * An id the server omits is deleted, moved out of reach, or never existed — and this is why the
 * three are indistinguishable by design: there is no `reason`, so pruning cannot become an oracle.
 * It stops the id costing a lookup on every subsequent load.
 */
export function prunePlans(
  storage: Storage,
  { userId, orgSlug, keep }: { userId: string; orgSlug: string; keep: readonly string[] },
): void {
  const key = keyFor(userId, orgSlug);
  const kept = new Set(keep);
  const before = read(storage, key);
  const after = before.filter((entry) => kept.has(entry.id));
  if (after.length === before.length) return;
  write(storage, key, after);
}

/**
 * Forget everything this account remembered, in every organisation — called at sign-out.
 *
 * It scans the store's own keys rather than taking a list of organisations, because the caller at
 * sign-out does not have one and asking it to would put the completeness of this sweep in the
 * hands of whoever writes the next org-switching feature.
 */
export function forgetAllForUser(storage: Storage, userId: string): void {
  const prefix = `${PREFIX}:${userId}:`;
  // **`length` + `key(i)`, not `Object.keys(storage)`.** The first version used `Object.keys`,
  // which happens to work on a real `localStorage` because the Web Storage API exposes stored keys
  // as own enumerable properties — a quirk of that one implementation, not of the `Storage`
  // interface. The unit test's map-backed `Storage` is a conforming implementation and returned
  // the method names instead, so the sweep silently found nothing. Caught by the test rather than
  // by reading; the fix is to use the interface the type actually promises.
  //
  // Keys are collected before anything is removed, because removing shifts every later index.
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      /* nothing to be done, and nothing worth telling the person signing out. */
    }
  }
}
