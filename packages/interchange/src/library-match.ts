import type { ImportGraph } from './import-graph.js';
import { isResourceTierFinding } from './mapper.js';
import type { InterchangeReport, ReportFinding } from './report.js';

/**
 * Leaving out a calendar only matched resources would hold (ADR-0208 D7, `docs/TECH_DEBT.md` #554).
 *
 * The mapper cannot know which resources the import will match to the library, because it never sees
 * the library, so it creates a calendar for every one a resource holds (ADR-0053 §5 rule 1). The
 * persisting layer can decide the matches, and then calls this pure function to take out the calendars
 * that nothing in the new plan would use. It lives beside the mapper because the tier decision and its
 * sentence live there, and because removing the mapper's finding needs the mapper's own definition of it.
 */

/** A source resource the import matches to an existing row, and whether that row's calendar is the file's. */
export interface MatchedResource {
  readonly name: string;
  /**
   * The calendar the matched row keeps is identical (ADR-0208 `calendarIdentityKey`) to the file's
   * calendar for it. False when it differs, when either has no calendar, or when the read could not
   * return it: the direction that tells the planner something may have been lost.
   */
  readonly keptCalendarSame: boolean;
}

/**
 * The calendar keys only resources hold: not the plan's default, not named by any activity, and held by
 * at least one resource. These are the only calendars that can be left out, so a caller can skip the
 * work of deciding sameness when this is empty.
 */
export function resourceOnlyCalendarKeys(graph: ImportGraph): ReadonlySet<string> {
  const needed = new Set<string>();
  if (graph.plan.defaultCalendarKey !== null) needed.add(graph.plan.defaultCalendarKey);
  for (const activity of graph.activities) {
    if (activity.calendarKey !== null) needed.add(activity.calendarKey);
  }
  const keys = new Set<string>();
  for (const resource of graph.resources) {
    if (resource.calendarKey !== null && !needed.has(resource.calendarKey)) {
      keys.add(resource.calendarKey);
    }
  }
  return keys;
}

export interface LeaveOutResult {
  /** The graph without the left-out calendars; their matched holders carry no calendar key. */
  readonly graph: ImportGraph;
  /** The report with each left-out calendar's tier finding replaced by {@link leftOutFinding}. */
  readonly report: InterchangeReport;
  /** The keys of the calendars left out, in the file's order. */
  readonly leftOut: readonly string[];
}

const MAX_NAMES_SHOWN = 3;

/** `“A”, “B”, “C” and N more`, in the order given. */
function nameList(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMES_SHOWN).map((name) => `“${name}”`);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${String(rest)} more` : shown.join(', ');
}

function leftOutFinding(
  calendarName: string,
  calendarKey: string,
  holders: readonly MatchedResource[],
): ReportFinding {
  const different = holders.filter((holder) => !holder.keptCalendarSame);
  const detail =
    `calendar “${calendarName}” was not created: the only resources in the file that use it ` +
    `(${nameList(holders.map((holder) => holder.name))}) matched existing resources, which keep ` +
    'their own calendars';
  const reason =
    different.length === 0
      ? 'the calendar each of them already has is the same as the file’s, so nothing was lost'
      : `the file gives ${nameList(different.map((holder) => holder.name))} a different working ` +
        `week, so ${different.length === 1 ? 'its' : 'their'} work is scheduled on the calendar the ` +
        'library already holds; an import never changes an existing resource’s calendar';
  return { kind: 'approximation', entity: 'calendar', sourceRef: calendarKey, detail, reason };
}

/**
 * Leave out every calendar that only matched resources hold. A calendar `K` is left out exactly when
 * `K` is not the plan's default, no activity names it, at least one resource holds it, and every
 * resource holding it is in `matched`.
 *
 * Pure and deterministic. A matched resource keeps the calendar it already has, so its source calendar
 * has no use: nothing references `K` afterwards, which is what lets the persisting layer skip it
 * (a reference that survived would fail the import at its calendar lookup, never silently).
 */
export function leaveOutCalendarsOnlyMatchedResourcesHold(
  graph: ImportGraph,
  report: InterchangeReport,
  matched: ReadonlyMap<string, MatchedResource>,
): LeaveOutResult {
  const candidates = resourceOnlyCalendarKeys(graph);
  const leftOut: string[] = [];
  const holdersOf = new Map<string, MatchedResource[]>();
  for (const calendar of graph.calendars) {
    if (!candidates.has(calendar.key)) continue;
    const holders = graph.resources.filter((resource) => resource.calendarKey === calendar.key);
    const matchedHolders: MatchedResource[] = [];
    for (const holder of holders) {
      const match = matched.get(holder.key);
      if (match !== undefined) matchedHolders.push(match);
    }
    if (matchedHolders.length !== holders.length) continue;
    leftOut.push(calendar.key);
    holdersOf.set(calendar.key, matchedHolders);
  }
  if (leftOut.length === 0) return { graph, report, leftOut };

  const dropped = new Set(leftOut);
  const nextGraph: ImportGraph = {
    ...graph,
    calendars: graph.calendars.filter((calendar) => !dropped.has(calendar.key)),
    resources: graph.resources.map((resource) =>
      resource.calendarKey !== null && dropped.has(resource.calendarKey)
        ? { ...resource, calendarKey: null }
        : resource,
    ),
  };

  // The mapper's sentence is replaced where it sat, so the planner sees one line change rather than one
  // vanish and another appear elsewhere. A finding that is not there (a bounded or hand-built report)
  // is appended instead; the new sentence is true either way.
  const approximations = [...report.approximations];
  for (const key of leftOut) {
    const calendar = graph.calendars.find((candidate) => candidate.key === key);
    const finding = leftOutFinding(calendar?.name ?? key, key, holdersOf.get(key) ?? []);
    const at = approximations.findIndex((existing) => isResourceTierFinding(existing, key));
    if (at === -1) approximations.push(finding);
    else approximations[at] = finding;
  }
  return { graph: nextGraph, report: { ...report, approximations }, leftOut };
}
