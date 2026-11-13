/**
 * **The bars a planner has put away from the whole-plan Follow logic offer, kept on this browser**
 * (ADR-0216 D6, "Remembered"). Pure over an injected `Storage`, in the shape of
 * `features/overview/model/recent-plans.ts`: nothing here reads a global, so it is testable without a
 * browser, and every storage call is guarded so a blocked or full store degrades to today's
 * session-only behaviour with nothing visible.
 *
 * **Per person on a device, per plan.** One key per signed-in user holds every plan's answers, so the
 * bound lives in one place and a second account on the same machine is asked for itself. Another
 * device, another browser or cleared site data is asked again. Only **activity ids** are stored,
 * never a name, so there is nothing to clear at sign-out.
 *
 * **Bounded.** At most 20 plans (the least recently written dropped) and 1,000 ids per plan (the most
 * recent kept; the rest are asked about again after a reload, which is what happened to every bar
 * before this existed). Ids are 36-character UUIDs, so the worst case is about 20 x 1,000 x 39 =
 * 780,000 characters against the ~5 million a browser allows an origin.
 *
 * **Why not `hooks/use-device-pref.ts`.** Its effect writes the current value to whatever the key now
 * is, so moving from plan P to plan Q would copy P's answers into Q. This store is keyed explicitly
 * on every call.
 */

/** How many plans a person's answers are kept for. */
export const DISMISSED_PLANS_CAP = 20;
/** How many bars one plan's answers hold. */
export const DISMISSED_IDS_CAP = 1000;

const PREFIX = 'schedulepoint:follow-plan-dismissed';

interface PlanEntry {
  at: number;
  ids: string[];
}

interface Stored {
  v: 1;
  plans: Record<string, PlanEntry>;
}

function keyFor(userId: string): string {
  return `${PREFIX}:${userId}`;
}

function isEntry(value: unknown): value is PlanEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { at?: unknown; ids?: unknown };
  return (
    typeof entry.at === 'number' &&
    Array.isArray(entry.ids) &&
    entry.ids.every((id) => typeof id === 'string')
  );
}

/** Corrupt, foreign or future-shaped data reads as empty: a convenience, with nothing to recover. */
function read(storage: Storage, key: string): Stored {
  const empty: Stored = { v: 1, plans: {} };
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return empty;
  }
  if (raw === null) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return empty;
    const { v, plans } = parsed as { v?: unknown; plans?: unknown };
    if (v !== 1 || typeof plans !== 'object' || plans === null || Array.isArray(plans)) {
      return empty;
    }
    const kept: Record<string, PlanEntry> = {};
    for (const [planId, entry] of Object.entries(plans)) {
      if (isEntry(entry)) kept[planId] = entry;
    }
    return { v: 1, plans: kept };
  } catch {
    return empty;
  }
}

function write(storage: Storage, key: string, value: Stored): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* unavailable or full: the answer lasts this session, as it did before. */
  }
}

/** The bars this person has put away in this plan on this browser. */
export function readDismissed(
  storage: Storage,
  { userId, planId }: { userId: string; planId: string },
): string[] {
  return read(storage, keyFor(userId)).plans[planId]?.ids ?? [];
}

/** Add `ids` to the plan's answers, stamping the plan as written `at`. */
export function rememberDismissed(
  storage: Storage,
  {
    userId,
    planId,
    ids,
    at,
  }: { userId: string; planId: string; ids: readonly string[]; at: number },
): void {
  if (ids.length === 0) return;
  const key = keyFor(userId);
  const stored = read(storage, key);
  const merged = [...new Set([...(stored.plans[planId]?.ids ?? []), ...ids])];
  stored.plans[planId] = { at, ids: merged.slice(-DISMISSED_IDS_CAP) };
  const planIds = Object.keys(stored.plans);
  if (planIds.length > DISMISSED_PLANS_CAP) {
    const oldestFirst = planIds.sort(
      (a, b) => (stored.plans[a]?.at ?? 0) - (stored.plans[b]?.at ?? 0),
    );
    for (const dropped of oldestFirst.slice(0, planIds.length - DISMISSED_PLANS_CAP)) {
      delete stored.plans[dropped];
    }
  }
  write(storage, key, stored);
}

/**
 * Drop the plan's remembered bars that are not in `keep` (no longer early, or gone). Writes only when
 * something was dropped, and leaves the plan's `at` alone: opening a plan is not answering it.
 */
export function pruneDismissed(
  storage: Storage,
  { userId, planId, keep }: { userId: string; planId: string; keep: ReadonlySet<string> },
): void {
  const key = keyFor(userId);
  const stored = read(storage, key);
  const entry = stored.plans[planId];
  if (entry === undefined) return;
  const ids = entry.ids.filter((id) => keep.has(id));
  if (ids.length === entry.ids.length) return;
  if (ids.length === 0) delete stored.plans[planId];
  else stored.plans[planId] = { at: entry.at, ids };
  write(storage, key, stored);
}
