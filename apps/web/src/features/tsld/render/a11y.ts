import type { ActivitySummary, DependencySummary } from '@repo/types';

import { formatConstraint } from '@/lib/constraint-format';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * Pure text builders for the TSLD's parallel accessible representation (ADR-0026 D7, M5). Kept out
 * of the component so the three-tier disclosure — lean per-keystroke name (Tier 1), on-demand
 * summary (Tier 2), and chain navigation — is exhaustively unit-testable with no DOM/React.
 */

/** Pluralise a whole-day count: `1 day`, `3 days`. */
function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'} float`;
}

/**
 * **Tier 1** — the one lean sentence spoken on every navigation keystroke:
 * `{code name}, {start}–{finish}, lane N, {float|critical}`. Float is added where it informs:
 * `critical` already implies zero float (so just "critical"); `near-critical` states the days;
 * otherwise the plain float; float is omitted when uncomputed (null). An unscheduled activity
 * says so and nothing more.
 */
export function describeActivity(a: ActivitySummary): string {
  const name = a.code ? `${a.code} ${a.name}` : a.name;
  if (a.earlyStart === null) return `${name}, not yet scheduled`;
  const dates =
    a.earlyFinish && a.earlyFinish !== a.earlyStart
      ? `${formatCalendarDate(a.earlyStart)} to ${formatCalendarDate(a.earlyFinish)}`
      : formatCalendarDate(a.earlyStart);
  const floatPart = a.isCritical
    ? ', critical'
    : a.totalFloat === null
      ? ''
      : a.isNearCritical
        ? `, near-critical, ${days(a.totalFloat)}`
        : `, ${days(a.totalFloat)}`;
  // Name a set date constraint so the pin drawn on the canvas has a spoken equivalent (WCAG 1.1.1).
  const constraint = formatConstraint(a);
  const constraintPart = constraint ? `, ${constraint.full}` : '';
  return `${name}, ${dates}, lane ${a.laneIndex + 1}${floatPart}${constraintPart}`;
}

/**
 * **Tier 2** — the on-demand (`Space`) detail: how many logic ties the activity has and which are
 * driving. `start driven by {name}` names the binding predecessor (the driving edge into it);
 * `drives {names}` names the successors whose start it drives. Derived purely from `dependencies`.
 */
export function summarizeLogic(id: string, dependencies: readonly DependencySummary[]): string {
  const preds = dependencies.filter((d) => d.successor.id === id);
  const succs = dependencies.filter((d) => d.predecessor.id === id);
  const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
  let text = `${count(preds.length, 'predecessor')}, ${count(succs.length, 'successor')}`;
  const drivenBy = preds.find((d) => d.isDriving)?.predecessor.name;
  if (drivenBy) text += `; start driven by ${drivenBy}`;
  const drives = succs.filter((d) => d.isDriving).map((d) => d.successor.name);
  if (drives.length > 0) text += `; drives ${drives.join(', ')}`;
  return text;
}

export interface ChainNeighbour {
  id: string;
  name: string;
  /** Whether the tie to this neighbour is the driving edge. */
  driving: boolean;
}

/**
 * Driving-first chain navigation (`[` predecessor, `]` successor). Among the focused activity's
 * ties in the given direction, prefer the **driving** edge — the binding tie a planner traces up
 * (or down) the driving/critical path — falling back to the first tie in list order. Returns null
 * when there is no tie in that direction. Repeated presses walk the path, since selection follows.
 */
export function chainNeighbour(
  focusedId: string,
  dependencies: readonly DependencySummary[],
  direction: 'pred' | 'succ',
): ChainNeighbour | null {
  const edges = dependencies.filter((d) =>
    direction === 'pred' ? d.successor.id === focusedId : d.predecessor.id === focusedId,
  );
  if (edges.length === 0) return null;
  const chosen = edges.find((d) => d.isDriving) ?? edges[0]!;
  const endpoint = direction === 'pred' ? chosen.predecessor : chosen.successor;
  // Prefix the code like Tier-1 describeActivity, so the neighbour reads consistently across tiers.
  const name = endpoint.code ? `${endpoint.code} ${endpoint.name}` : endpoint.name;
  return { id: endpoint.id, name, driving: chosen.isDriving };
}

/** The spoken line for a chain-nav jump: names the neighbour and whether the tie drives. */
export function announceChainStep(
  direction: 'pred' | 'succ',
  neighbour: ChainNeighbour | null,
): string {
  const label = direction === 'pred' ? 'Predecessor' : 'Successor';
  if (!neighbour) return direction === 'pred' ? 'No predecessors.' : 'No successors.';
  return `${label}: ${neighbour.name}${neighbour.driving ? ', driving' : ''}.`;
}
