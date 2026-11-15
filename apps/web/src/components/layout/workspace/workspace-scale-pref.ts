/**
 * **Whether the reader chose actual size for the plan workspace** (ADR-0222 D4.3, spec story 3).
 *
 * The reader's answer to "I have zoomed, do not shrink this back" in a browser that cannot report its
 * zoom. Per **device**, not per account — it describes the reader's eyes and window, so it is not swept
 * at sign-out, the same reasoning as the viewport notice's acknowledgement and column widths
 * (ADR-0173). It mirrors `viewport-notice-ack.ts`: `localStorage`, falling back to `sessionStorage`,
 * falling back to module memory, a failure at any tier swallowed (a preference must never be the thing
 * that breaks the app), and `localStorage` changes in another tab reach this one through the `storage`
 * event.
 *
 * Only the exact string `'1'` means actual size; anything else, or a read that throws, means "scale when
 * needed" (spec §2, "Validation rules"). Choosing the scaled layout again **removes** the key rather than
 * writing a second value, so the stored state has exactly one shape.
 */

/** Exported so the e2e fixture writes the same string the app reads. */
export const WORKSPACE_ACTUAL_SIZE_KEY = 'schedulepoint:workspace-actual-size';

let memoryActualSize = false;
const listeners = new Set<() => void>();

const local = (): Storage => window.localStorage;
const session = (): Storage => window.sessionStorage;

function read(storage: () => Storage): boolean {
  try {
    return storage().getItem(WORKSPACE_ACTUAL_SIZE_KEY) === '1';
  } catch {
    return false;
  }
}

function write(storage: () => Storage, on: boolean): boolean {
  try {
    if (on) storage().setItem(WORKSPACE_ACTUAL_SIZE_KEY, '1');
    else storage().removeItem(WORKSPACE_ACTUAL_SIZE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Whether the reader chose actual size on this device. */
export function readActualSize(): boolean {
  return memoryActualSize || read(local) || read(session);
}

/** Press the switch: remember the choice as durably as storage allows. */
export function setActualSize(on: boolean): void {
  // Clear every tier first so a stale `'1'` in a lower tier cannot outvote a later "scaled".
  memoryActualSize = false;
  if (!on) {
    write(local, false);
    write(session, false);
  } else if (!write(local, true) && !write(session, true)) {
    memoryActualSize = true;
  }
  for (const listener of listeners) listener();
}

/** Subscribe to changes, including another tab's (the `storage` event fires in every OTHER document). */
export function subscribeActualSize(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    // `key === null` is `localStorage.clear()`, which also resets the choice.
    if (event.key === null || event.key === WORKSPACE_ACTUAL_SIZE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Forget the module-memory tier. For tests only. */
export function resetActualSizeForTests(): void {
  memoryActualSize = false;
}
