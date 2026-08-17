import type { DependencySummary, DependencyType } from '@repo/types';

/**
 * **Where a dependency arrow goes on the Gantt — geometry only, and deliberately no routing.**
 *
 * ADR-0059 §4 shipped the Gantt with no arrows, on the reasoning that they would "drag the rejected
 * substrate back in through the side door". That phrase is about **routing** — obstacle avoidance
 * and corridor bundling (ADR-0065) — and routing cost is independent of the render target, so
 * answering "SVG, not canvas" does not by itself answer it.
 *
 * What answers it is the geometry, and it is recorded here rather than assumed. TSLD bars **share
 * lanes**, so a link there must be routed around bars sitting between its endpoints — that is where
 * ADR-0065's expensive half lives. Gantt rows are **one bar per row, vertically separated**, so a
 * link is a simple elbow through whitespace: out of the predecessor, across a gutter, into the
 * successor. There is nothing to avoid.
 *
 * That claim is a **structural test**, not a sentence: `link-paths.structural.test.ts` asserts this
 * module names no obstacle search. A future contributor adding one would be re-opening ADR-0059's
 * objection, and should have to say so.
 *
 * ## Culling, and why the rule is what it is
 *
 * Only links with **at least one endpoint in the rendered window** are drawn. The alternative —
 * every link whose row span crosses the window — includes a link between two rows a thousand apart,
 * which paints a line across the whole chart with both ends off-screen: a mark that asserts a
 * relationship and shows neither party to it.
 *
 * Measured, not assumed (M0-T1 R5, `apps/web/measure-gantt/link-density.spec.ts`): on a
 * 2,160-activity / 3,200-link programme at 1646×1097 with 39 rendered rows, the adopted rule gives
 * **p95 71–74 and is sort-independent**, while the rejected span-crossing rule reaches **88 p95 /
 * 93 max** under the Start sort. Both sit far under the 300 threshold, so the cap below is a
 * guardrail rather than a load-bearing mitigation — which is worth saying, because a cap that never
 * fires is a cap nobody has watched fire.
 */

/** A link ready to draw: which rows, and what kind of tie. */
export interface GanttLinkPath {
  id: string;
  type: DependencyType;
  /** Row indices in the CURRENT ordering, or null when that endpoint is outside the window. */
  fromRow: number | null;
  toRow: number | null;
  /** True when an endpoint is off-window and the arrow needs an edge stub rather than a head. */
  fromOffscreen: boolean;
  toOffscreen: boolean;
}

/** The outcome of a derivation, including what was withheld. */
export interface GanttLinkSet {
  paths: GanttLinkPath[];
  /**
   * How many links were dropped by the cap. **Always present**, and the caller must show it when it
   * is non-zero: a silent truncation reads as "that is all the links there are", which is the defect
   * class this register keeps recording (ADR-0081's dark capability, ADR-0059 M6's inert control,
   * ADR-0090's "no silent caps"). Either the count is visible or there is no cap.
   */
  withheld: number;
}

/**
 * The most links drawn at once.
 *
 * A guardrail rather than a tuned figure: the measurement above puts the realistic p95 at ~74, so
 * this is roughly four times the worst case seen on a 2,160-activity programme. It exists because
 * an unbounded derivation over a pathological import is the one shape nobody measured.
 */
export const MAX_RENDERED_LINKS = 300;

/**
 * The links to draw for a window of rows.
 *
 * `rowIndexById` holds only the rows currently rendered — that IS the window, so membership and
 * position come from one lookup rather than a range comparison that could disagree with what the
 * virtualizer actually mounted.
 *
 * `selectedId` widens the set: a selected activity's own links are drawn **whatever the toggle
 * says**, so "why is this bar here?" is answerable without turning anything on. That is the
 * toggle's off-state rather than an exception to it.
 */
export function ganttLinkPaths({
  dependencies,
  rowIndexById,
  showAll,
  selectedId,
  max = MAX_RENDERED_LINKS,
}: {
  dependencies: readonly DependencySummary[];
  rowIndexById: ReadonlyMap<string, number>;
  showAll: boolean;
  selectedId?: string | null | undefined;
  max?: number;
}): GanttLinkSet {
  const paths: GanttLinkPath[] = [];
  let withheld = 0;

  for (const dependency of dependencies) {
    const fromId = dependency.predecessor.id;
    const toId = dependency.successor.id;

    const touchesSelection = selectedId != null && (fromId === selectedId || toId === selectedId);
    if (!showAll && !touchesSelection) continue;

    const fromRow = rowIndexById.get(fromId);
    const toRow = rowIndexById.get(toId);
    // The culling rule: at least one endpoint must be on screen. A link with both ends outside the
    // window is a line across the chart showing neither party to the relationship it asserts.
    if (fromRow === undefined && toRow === undefined) continue;

    if (paths.length >= max) {
      withheld += 1;
      continue;
    }

    paths.push({
      id: dependency.id,
      type: dependency.type,
      fromRow: fromRow ?? null,
      toRow: toRow ?? null,
      fromOffscreen: fromRow === undefined,
      toOffscreen: toRow === undefined,
    });
  }

  return { paths, withheld };
}

/**
 * The textual equivalent of the arrows for one row (spec GV-3).
 *
 * The arrows are `aria-hidden` — an SVG elbow is not readable — so without this the logic overlay
 * would be a graphical-only carrier, which is the WCAG 1.4.1 defect ADR-0055 exists about and the
 * one `grid-columns.ts` already avoids for dates and float. Rendered `sr-only`, because the sighted
 * cue is the line itself and a visible list on every row would bury the chart it annotates.
 *
 * Names, not counts. "2 predecessors" tells a reader there is something to look for and not what it
 * is; the whole question a planner asks of a link is *which activity*.
 */
export function predecessorSummary(
  activityId: string,
  dependencies: readonly DependencySummary[],
): string | null {
  const names = dependencies
    .filter((d) => d.successor.id === activityId)
    .map((d) => d.predecessor.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  if (names.length === 0) return null;
  return `Follows ${names.join(', ')}.`;
}
