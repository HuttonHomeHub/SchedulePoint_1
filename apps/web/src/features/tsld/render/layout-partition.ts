/**
 * **The swimlane partition Tidy and Re-layout search inside** (swimlanes M2-T6, feature-spec §4.5,
 * `docs/specs/swimlanes/m0-reading.md`).
 *
 * Swimlanes stack top to bottom and no two share a row, so the diagram's *display* lanes are the
 * swimlanes' own lanes laid end to end, each swimlane as tall as its highest lane (at least one row,
 * as `projectSwimlanes` gives an empty one). The search works in lanes **local to a swimlane** — row 0
 * is the swimlane's first lane, the form `packLanes` and `deriveSwimlaneLanes` use and the form that is
 * stored — and scores the objective on display lanes, so a link between two swimlanes counts. That is
 * the interface the feature exists to show.
 *
 * Pure and render-layer only: it names a swimlane by an opaque key and imports nothing from the
 * swimlanes feature (ADR-0026 D8).
 */
export interface LayoutPartition {
  /** Activity id → swimlane key. An id with no entry is grouped with every other such id. */
  swimlaneOf: ReadonlyMap<string, string>;
  /** Every swimlane key, top to bottom, including swimlanes with no drawn bar (each takes one row). */
  order: readonly string[];
}

/** The key of every id `swimlaneOf` does not list, which the stack puts last. */
export const UNLISTED_SWIMLANE = '\u0000unlisted';

export function swimlaneKeyOf(partition: LayoutPartition, id: string): string {
  return partition.swimlaneOf.get(id) ?? UNLISTED_SWIMLANE;
}

/**
 * The stack the drawn bars occupy: `partition.order`, then the unlisted group if a bar needs it, then
 * any key a bar names that `order` does not (sorted, so the stack never depends on iteration order).
 */
export function stackOf(partition: LayoutPartition, drawnIds: Iterable<string>): string[] {
  const stack = [...partition.order];
  const known = new Set(stack);
  const extra = new Set<string>();
  for (const id of drawnIds) {
    const key = swimlaneKeyOf(partition, id);
    if (!known.has(key)) extra.add(key);
  }
  const rest = [...extra].sort();
  const unlisted = rest.indexOf(UNLISTED_SWIMLANE);
  if (unlisted !== -1) {
    rest.splice(unlisted, 1);
    rest.push(UNLISTED_SWIMLANE);
  }
  return [...stack, ...rest];
}

/** Rows of each swimlane in `stack`: its highest lane + 1 among the drawn bars, and at least one. */
export function bandRowsOf(
  partition: LayoutPartition,
  stack: readonly string[],
  lanes: ReadonlyMap<string, number>,
  drawnIds: Iterable<string>,
): Map<string, number> {
  const rows = new Map(stack.map((key) => [key, 1]));
  for (const id of drawnIds) {
    const lane = lanes.get(id);
    if (lane === undefined) continue;
    const key = swimlaneKeyOf(partition, id);
    rows.set(key, Math.max(rows.get(key) ?? 1, lane + 1));
  }
  return rows;
}

/** First display lane of each swimlane in `stack`. */
export function offsetsOf(
  stack: readonly string[],
  rows: ReadonlyMap<string, number>,
): Map<string, number> {
  const offsets = new Map<string, number>();
  let at = 0;
  for (const key of stack) {
    offsets.set(key, at);
    at += rows.get(key) ?? 1;
  }
  return offsets;
}

/** The display lane of every drawn bar in `lanes`; an id that is not a drawn bar is left out. */
export function displayLanesOf(
  partition: LayoutPartition,
  stack: readonly string[],
  lanes: ReadonlyMap<string, number>,
  drawnIds: readonly string[],
): Map<string, number> {
  const offsets = offsetsOf(stack, bandRowsOf(partition, stack, lanes, drawnIds));
  const out = new Map<string, number>();
  for (const id of drawnIds) {
    const lane = lanes.get(id);
    if (lane !== undefined) out.set(id, offsets.get(swimlaneKeyOf(partition, id))! + lane);
  }
  return out;
}

/**
 * The height of the diagram in rows: what a row budget is counted in while swimlanes are shown.
 * `drawnIds` are the bars that take part; an undrawn activity is on no row.
 */
export function displayRowsOf(
  partition: LayoutPartition,
  lanes: ReadonlyMap<string, number>,
  drawnIds: readonly string[],
): number {
  const stack = stackOf(partition, drawnIds);
  let total = 0;
  for (const rows of bandRowsOf(partition, stack, lanes, drawnIds).values()) total += rows;
  return total;
}
