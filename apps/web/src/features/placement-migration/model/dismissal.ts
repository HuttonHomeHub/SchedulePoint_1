/**
 * Whether this account has dismissed the placement-migration notice for a given plan.
 *
 * **Per user AND per plan.** Per user because a shared machine must not carry one person's
 * dismissals into the next person's session (`docs/TECH_DEBT.md` #171, the defect the active-org
 * hint had); per plan because the notice reports what happened to *that* plan, and dismissing the
 * report for one programme says nothing about another.
 *
 * **Browser storage, deliberately, and the trade is stated.** A dismissal is a per-viewer
 * convenience — nobody else needs to know, nothing downstream depends on it, and losing it costs a
 * reader one extra sentence they can dismiss again. Persisting it server-side would mean a column,
 * a migration and a write endpoint for a preference; ADR-0098's "Jump back in" took the same
 * decision for the same reason. Every read and write is wrapped, because a private window, cleared
 * site data or a quota error must leave the notice showing rather than throw on the way to the
 * canvas.
 */
const PREFIX = 'sp:placement-migration-dismissed';

function keyFor(userId: string, planId: string): string {
  return `${PREFIX}:${userId}:${planId}`;
}

export function isDismissed(storage: Storage, userId: string, planId: string): boolean {
  try {
    return storage.getItem(keyFor(userId, planId)) === '1';
  } catch {
    return false;
  }
}

export function dismiss(storage: Storage, userId: string, planId: string): void {
  try {
    storage.setItem(keyFor(userId, planId), '1');
  } catch {
    // A full or blocked store means the notice returns on the next visit. That is the right way
    // for this to fail: a notice shown twice is a nuisance, and one silently suppressed is the
    // absence this whole milestone exists to remove.
  }
}

/**
 * Forget every plan this account dismissed — called at sign-out, beside the two existing sweeps.
 *
 * It scans the store's own keys rather than taking a list of plans, for the same reason
 * `forgetAllForUser` does: the caller at sign-out has no such list, and asking it for one would put
 * the completeness of this sweep in the hands of whoever writes the next plan-switching feature.
 *
 * **`storage.length` + `storage.key(i)`, never `Object.keys(storage)`.** That shortcut happens to
 * work on a real `localStorage` because the Web Storage API exposes stored keys as own enumerable
 * properties — a quirk of that one implementation and not of the `Storage` interface — so a
 * conforming map-backed store returns the method names instead and the sweep silently finds
 * nothing. `recent-plans.ts` records shipping exactly that and being caught by its own test.
 *
 * Keys are collected before anything is removed, because removing shifts every later index.
 */
export function forgetDismissalsForUser(storage: Storage, userId: string): void {
  const prefix = `${PREFIX}:${userId}:`;
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
      // Best effort: a key that refuses to go leaves one stale dismissal behind, which suppresses
      // one notice for one plan. Not worth failing a sign-out over.
    }
  }
}
