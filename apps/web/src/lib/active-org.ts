const ACTIVE_ORG_PREFIX = 'schedulepoint-active-org';

/**
 * The "last active organisation" convenience: remembers which org slug the user was last in so the
 * app can send them back there. The URL is always the authoritative active org
 * (docs/FRONTEND_ARCHITECTURE.md); this is only a hint.
 *
 * **Keyed by user id, and swept at sign-out** (`docs/TECH_DEBT.md` #171). It used to be one
 * unqualified key that nothing ever removed, so on a shared machine the next person to sign in was
 * sent to the previous person's organisation — and the redirect is silent, so what they see is the
 * app opening somewhere they did not choose. It cannot leak DATA (every read is authorised
 * server-side and a slug they cannot reach 404s), but it names an organisation they may have no
 * business knowing exists.
 *
 * The shape deliberately matches `recent-plans`' `<prefix>:<userId>` convention, including the
 * separator that keeps `u1` and `u12` apart, so the two per-user stores are swept the same way.
 */
function keyFor(userId: string): string {
  return `${ACTIVE_ORG_PREFIX}:${userId}`;
}

export function getLastActiveOrg(userId: string): string | null {
  try {
    return window.localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export function setLastActiveOrg(userId: string, slug: string): void {
  try {
    window.localStorage.setItem(keyFor(userId), slug);
  } catch {
    /* localStorage unavailable — the URL still drives the active org. */
  }
}

/**
 * Forget this account's hint, called at sign-out beside `forgetAllForUser`.
 *
 * Takes the `Storage` so it can be driven by a map-backed implementation in tests — and because
 * `recent-plans` learnt the hard way that `Object.keys(storage)` works only by a quirk of the
 * browser's own implementation. This removes ONE key, so it needs no enumeration at all.
 */
export function forgetLastActiveOrg(storage: Storage, userId: string): void {
  try {
    storage.removeItem(keyFor(userId));
  } catch {
    /* nothing to do — the hint is advisory */
  }
}
