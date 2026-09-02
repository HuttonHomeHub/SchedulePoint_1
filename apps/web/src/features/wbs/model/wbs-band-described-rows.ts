import type { WbsBandGroupInput } from './wbs-groups';

/**
 * The band's rows in **depth-first tree order**, for the text equivalent only
 * (`docs/TECH_DEBT.md` #232).
 *
 * `wbsBandGroups` sorts by depth, and `Array.prototype.sort` is stable, so what it produces is
 * **breadth-by-level**: every depth-0 row, then every depth-1 row, then every depth-2 row. Depth-1
 * rows from unrelated branches land next to each other. That is fine for the painter — `wbsBandBars`
 * derives a row's y from the SET of depths present, not from array order — and wrong for a reader,
 * who is told "the nearest preceding item one level up contains this one" by `aria-level` and would
 * be told a lie.
 *
 * So this returns a **copy**, re-ordered. The array handed to the canvas is deliberately not
 * touched: the two consumers want different orders for good reasons, and the alternative — changing
 * the shared sort — would silently re-order the band's paint for a text feature.
 *
 * The derived "Unassigned" bucket stays **last**, where the band draws it and where a planner
 * expects the leftovers.
 */
export function wbsBandDescribedRows(
  rows: readonly WbsBandGroupInput[],
): readonly WbsBandGroupInput[] {
  const bucket = rows.filter((r) => r.id === null);
  const summaries = rows.filter((r): r is WbsBandGroupInput & { id: string } => r.id !== null);

  const childrenOf = new Map<string | null, (WbsBandGroupInput & { id: string })[]>();
  for (const row of summaries) {
    const siblings = childrenOf.get(row.parentId);
    if (siblings) siblings.push(row);
    else childrenOf.set(row.parentId, [row]);
  }

  const ordered: WbsBandGroupInput[] = [];
  // `seen` guards a cycle, which ADR-0038 forbids and this render-path code must not hang on —
  // the same posture `wbsBandGroups`' own two walks take, for the same reason.
  const seen = new Set<string>();
  const walk = (parentId: string | null): void => {
    for (const row of childrenOf.get(parentId) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      ordered.push(row);
      walk(row.id);
    }
  };
  walk(null);

  // A summary whose parent is another summary the band did not emit would otherwise vanish from
  // the description while still being painted. `parentId` is already the RESOLVED parent, so this
  // can only fire on a cycle — but a row silently missing is exactly the failure this file exists
  // to prevent, so it is picked up rather than assumed impossible.
  for (const row of summaries) {
    if (!seen.has(row.id)) ordered.push(row);
  }

  return [...ordered, ...bucket];
}
