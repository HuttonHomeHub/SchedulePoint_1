/**
 * **What the viewport notice remembers, and for how long** (ADR-0179, `docs/specs/minimum-viewport`
 * §2.3/§2.5).
 *
 * Two memories, deliberately different:
 *
 * - **Acknowledged** — the reader pressed *Continue anyway*. Per **device**, not per account: it
 *   describes the reader's eyes and their window, not who they are, so it is **not** swept at
 *   sign-out (`useSignOut`) — the same reason column widths are per device (ADR-0173). Kept in
 *   `localStorage`, falling back to `sessionStorage`, falling back to module memory, and a failure
 *   at any tier is swallowed: the notice must never be the thing that breaks the app.
 * - **Dismissed** — Escape, the dialog's native close, or *Dismiss* on the banner. For this
 *   **visit** only (the tab's `sessionStorage`, and module memory when that is blocked), so a
 *   reader who merely dismissed it meets it again next time.
 *
 * Only the exact string `'1'` counts as acknowledged. A garbled value, or a read that throws, is
 * "not acknowledged": the failure mode of showing the page once more is a press, whereas the
 * opposite failure would hide the explanation for ever.
 *
 * **A fifth per-device preference idiom, accepted rather than hidden.** `useFirstUseHint`
 * (`features/tsld/toolbar/use-first-use-hint.ts`) keeps a JSON map under one key, has no visit-only
 * tier, no `sessionStorage` fallback and no `storage` listener, and fails *open*;
 * `COLUMN_WIDTHS_STORAGE_KEY` (`features/gantt/layout/column-widths.ts`) is a third shape. Bending a
 * working hook to fit one consumer would change its storage shape and semantics, so this module
 * stands alone. A single per-device preference hook is the recorded tidy-up (the plan's "Next in
 * line").
 */

/** Exported so the e2e fixture writes the same string the app reads (`e2e-support/test.ts`). */
export const VIEWPORT_NOTICE_ACK_KEY = 'schedulepoint:viewport-notice-acknowledged';

/** Visit-only. A different key from the persistent one, so nothing can mistake one for the other. */
const DISMISSED_KEY = 'schedulepoint:viewport-notice-dismissed';

export type NoticeMemory = 'acknowledged' | 'dismissed' | null;

let memoryAcknowledged = false;
let memoryDismissed = false;
const listeners = new Set<() => void>();

function read(storage: () => Storage, key: string): boolean {
  try {
    return storage().getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(storage: () => Storage, key: string): boolean {
  try {
    storage().setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

const local = (): Storage => window.localStorage;
const session = (): Storage => window.sessionStorage;

/** What the reader has already told us. Acknowledged outranks dismissed. */
export function readNoticeMemory(): NoticeMemory {
  if (
    memoryAcknowledged ||
    read(local, VIEWPORT_NOTICE_ACK_KEY) ||
    read(session, VIEWPORT_NOTICE_ACK_KEY)
  ) {
    return 'acknowledged';
  }
  if (memoryDismissed || read(session, DISMISSED_KEY)) return 'dismissed';
  return null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** *Continue anyway*: remember on this device, as durably as storage allows. */
export function acknowledgeNotice(): void {
  if (!write(local, VIEWPORT_NOTICE_ACK_KEY) && !write(session, VIEWPORT_NOTICE_ACK_KEY)) {
    memoryAcknowledged = true;
  }
  notify();
}

/** Escape, a native close, or the banner's *Dismiss*: this visit only. */
export function dismissNoticeForVisit(): void {
  if (!write(session, DISMISSED_KEY)) memoryDismissed = true;
  notify();
}

/**
 * Subscribe to changes, including another tab's acknowledgement: the `storage` event fires in every
 * OTHER same-origin document when `localStorage` changes, which is what lets a second tab drop its
 * banner the moment the first is answered. `sessionStorage` is per tab and fires nothing across.
 */
export function subscribeNoticeMemory(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    // `key === null` is `localStorage.clear()`, which also resets the acknowledgement.
    if (event.key === null || event.key === VIEWPORT_NOTICE_ACK_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Forget the module-memory tier. For tests only: production has no way back from a press. */
export function resetNoticeMemoryForTests(): void {
  memoryAcknowledged = false;
  memoryDismissed = false;
}
