const ACTIVE_ORG_KEY = 'schedulepoint-active-org';

/**
 * The "last active organisation" convenience: remembers which org slug the user
 * was last in so the app can send them back there. The URL is always the
 * authoritative active org (docs/FRONTEND_ARCHITECTURE.md); this is only a hint.
 */
export function getLastActiveOrg(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveOrg(slug: string): void {
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, slug);
  } catch {
    /* localStorage unavailable — the URL still drives the active org. */
  }
}
