import type { CanonicalActivityStatus } from './canonical.js';
import type {
  ImportActivity,
  ImportAssignment,
  ImportCalendar,
  ImportDependency,
  ImportGraph,
  ImportResource,
  ImportWorkWindow,
} from './import-graph.js';
import type { ReportFinding } from './report.js';

/**
 * The **validate / repair / report** step (ADR-0050 step 3, the ADR-0035 reject-repair-report contract).
 * It takes the mapped {@link ImportGraph} and returns a graph that is **guaranteed valid for the domain
 * services** — recording every deviation as a {@link ReportFinding}. Nothing is silently changed. The
 * importer bypasses the domain services (it persists in bulk), so this step re-implements every invariant
 * those services would enforce, and the DB CHECKs would otherwise hard-reject.
 *
 * All repairs are **pure + deterministic** (no clock, randomness or input-order sensitivity): the same
 * graph always repairs to the same graph. The steps run in a fixed order:
 *   1. **Duplicate activity code** → suffix later duplicates (`CODE`, `CODE-2`, `CODE-3`, …).
 *   2. **WBS parent** (ADR-0038) → null a parent that is missing / not a `WBS_SUMMARY`; break parent-tree cycles.
 *   3. **Constraint pairing** (ADR-0035 §7) → drop an orphaned constraint type-or-date (both, or neither).
 *   4. **Progress** (ADR-0035 §6) → clamp percents; derive/repair status; N08/N18; `resumeDate ≥ suspendDate`.
 *   5. **Dangling edge** (endpoint references a missing activity) → drop the edge.
 *   6. **Summary endpoint** (ADR-0038) → drop a dependency touching a `WBS_SUMMARY` (a summary carries no logic).
 *   7. **Duplicate edge** (`pred, succ, type`) → keep the first, drop the rest (ADR-0021 / N04).
 *   8. **Cycle** → break the deterministically-chosen edge until the graph is acyclic (ADR-0021).
 *   9. **Resources / assignments** (ADR-0039/0040) → null an unresolved resource calendar; drop dangling /
 *      duplicate assignments; demote a `MATERIAL` driver and any second driver on an activity.
 *  10. **Calendar windows** (ADR-0036 §2 / ADR-0068) → sort, drop empty and merge overlapping working
 *      windows within each day; raise a below-floor `hoursPerDay` to the domain's minimum.
 */

export interface ValidateResult {
  readonly graph: ImportGraph;
  readonly findings: ReportFinding[];
}

/** Deterministically de-duplicate activity codes by suffixing later collisions. */
function repairDuplicateCodes(
  activities: ImportActivity[],
  findings: ReportFinding[],
): ImportActivity[] {
  const used = new Set<string>();
  return activities.map((activity) => {
    if (!used.has(activity.code)) {
      used.add(activity.code);
      return activity;
    }
    let suffix = 2;
    let candidate = `${activity.code}-${suffix}`;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${activity.code}-${suffix}`;
    }
    used.add(candidate);
    findings.push({
      kind: 'repair',
      entity: 'activity',
      sourceRef: activity.key,
      detail: `duplicate activity code "${activity.code}" renamed to "${candidate}"`,
      reason: 'activity codes must be unique within a plan',
    });
    return { ...activity, code: candidate };
  });
}

/** Drop dependencies whose predecessor or successor is not a known activity. */
function repairDanglingEdges(
  dependencies: ImportDependency[],
  activityKeys: ReadonlySet<string>,
  findings: ReportFinding[],
): ImportDependency[] {
  return dependencies.filter((edge) => {
    const missingPred = !activityKeys.has(edge.predecessorKey);
    const missingSucc = !activityKeys.has(edge.successorKey);
    if (!missingPred && !missingSucc) return true;
    const which =
      missingPred && missingSucc ? 'both endpoints' : missingPred ? 'predecessor' : 'successor';
    findings.push({
      kind: 'repair',
      entity: 'relationship',
      sourceRef: edge.key,
      detail: `dangling edge ${edge.predecessorKey}→${edge.successorKey} (${edge.type}) dropped: ${which} not found`,
      reason: 'dependency endpoint does not exist',
    });
    return false;
  });
}

/** Keep the first of each `(predecessorKey, successorKey, type)`, dropping later duplicates. */
function repairDuplicateEdges(
  dependencies: ImportDependency[],
  findings: ReportFinding[],
): ImportDependency[] {
  const seen = new Set<string>();
  return dependencies.filter((edge) => {
    const signature = `${edge.predecessorKey}::${edge.successorKey}::${edge.type}`;
    if (!seen.has(signature)) {
      seen.add(signature);
      return true;
    }
    findings.push({
      kind: 'repair',
      entity: 'relationship',
      sourceRef: edge.key,
      detail: `duplicate ${edge.type} edge ${edge.predecessorKey}→${edge.successorKey} de-duplicated`,
      reason: 'a dependency of this type already exists between these activities (N04)',
    });
    return false;
  });
}

/**
 * Find one cycle in the directed predecessor→successor graph, deterministically. Nodes are explored in
 * sorted-key order and each node's out-edges in `(successorKey, type, key)` order, so the cycle returned
 * is a stable function of the edge set (never of input order). Returns the ordered edges forming the
 * cycle, or null when the graph is acyclic.
 *
 * A single call is O(V + E): one DFS that rebuilds the adjacency map once. {@link repairCycles} calls it
 * in a loop (once per broken edge), so the repair is O(E × (V + E)) in the worst case (many disjoint
 * short cycles). That worst case is **provably bounded** because `importXer` hard-rejects any graph with
 * more than `MAX_DEPENDENCIES` edges (ADR-0050, B1) BEFORE this runs — E is capped, so the repair cost
 * is capped. A future optimisation could maintain the adjacency incrementally; the ceiling makes it
 * unnecessary for correctness/liveness.
 */
function findCycle(dependencies: readonly ImportDependency[]): ImportDependency[] | null {
  const adjacency = new Map<string, ImportDependency[]>();
  const nodes = new Set<string>();
  for (const edge of dependencies) {
    nodes.add(edge.predecessorKey);
    nodes.add(edge.successorKey);
    const list = adjacency.get(edge.predecessorKey);
    if (list === undefined) adjacency.set(edge.predecessorKey, [edge]);
    else list.push(edge);
  }
  for (const list of adjacency.values()) {
    list.sort((a, b) =>
      a.successorKey !== b.successorKey
        ? a.successorKey < b.successorKey
          ? -1
          : 1
        : a.type !== b.type
          ? a.type < b.type
            ? -1
            : 1
          : a.key < b.key
            ? -1
            : a.key > b.key
              ? 1
              : 0,
    );
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  for (const node of nodes) colour.set(node, WHITE);

  for (const start of [...nodes].sort()) {
    if (colour.get(start) !== WHITE) continue;
    const pathNodes: string[] = [start];
    const pathEdges: ImportDependency[] = []; // pathEdges[i] enters pathNodes[i + 1]
    const cursor: number[] = [0];
    colour.set(start, GREY);

    while (pathNodes.length > 0) {
      const u = pathNodes[pathNodes.length - 1];
      const index = cursor[cursor.length - 1];
      if (u === undefined || index === undefined) break;
      const outs = adjacency.get(u) ?? [];
      if (index >= outs.length) {
        colour.set(u, BLACK);
        pathNodes.pop();
        pathEdges.pop();
        cursor.pop();
        continue;
      }
      cursor[cursor.length - 1] = index + 1;
      const edge = outs[index];
      if (edge === undefined) continue;
      const v = edge.successorKey;
      const vColour = colour.get(v);
      if (vColour === GREY) {
        const position = pathNodes.indexOf(v);
        return [...pathEdges.slice(position), edge];
      }
      if (vColour === WHITE) {
        colour.set(v, GREY);
        pathNodes.push(v);
        pathEdges.push(edge);
        cursor.push(0);
      }
    }
  }
  return null;
}

/**
 * Break every cycle by removing, on each detected cycle, the **lexicographically-largest edge** by
 * `(predecessorCode, successorCode, type, predecessorKey, successorKey)` — a total, deterministic order,
 * robust even when codes collide. Repeats until the graph is acyclic (bounded by the edge count).
 */
function repairCycles(
  dependencies: ImportDependency[],
  codeByKey: ReadonlyMap<string, string>,
  findings: ReportFinding[],
): ImportDependency[] {
  const breakTuple = (edge: ImportDependency): string => {
    const predCode = codeByKey.get(edge.predecessorKey) ?? edge.predecessorKey;
    const succCode = codeByKey.get(edge.successorKey) ?? edge.successorKey;
    return [predCode, succCode, edge.type, edge.predecessorKey, edge.successorKey].join('::');
  };

  let remaining = dependencies;
  // The graph has a finite number of edges; each iteration removes exactly one, so this terminates.
  for (let guard = 0; guard <= dependencies.length; guard += 1) {
    const cycle = findCycle(remaining);
    if (cycle === null) return remaining;

    let victim = cycle[0];
    if (victim === undefined) return remaining;
    let victimTuple = breakTuple(victim);
    for (const edge of cycle) {
      const tuple = breakTuple(edge);
      if (tuple > victimTuple) {
        victim = edge;
        victimTuple = tuple;
      }
    }

    const chosen = victim;
    const predCode = codeByKey.get(chosen.predecessorKey) ?? chosen.predecessorKey;
    const succCode = codeByKey.get(chosen.successorKey) ?? chosen.successorKey;
    findings.push({
      kind: 'repair',
      entity: 'relationship',
      sourceRef: chosen.key,
      detail: `cycle broken by dropping ${chosen.type} edge ${predCode}→${succCode}`,
      reason: 'the dependency graph must be acyclic (ADR-0021)',
    });
    remaining = remaining.filter((edge) => edge.key !== chosen.key);
  }
  return remaining;
}

/**
 * Whether the dependency set contains a cycle — the whole-graph, O(V + E) acyclicity check the commit
 * path runs ONCE as defence-in-depth (ADR-0050, B3), reusing the exact deterministic {@link findCycle}
 * walk. `validateAndRepair` already guarantees an acyclic graph, so on the normal path this returns
 * false; it exists so the persisting layer can assert the DAG invariant (ADR-0021) without an O(E²)
 * per-edge loop.
 */
export function containsCycle(dependencies: readonly ImportDependency[]): boolean {
  return findCycle(dependencies) !== null;
}

// ---------------------------------------------------------------------------------------------------------
// WBS parentage (ADR-0038).
// ---------------------------------------------------------------------------------------------------------

/**
 * Find one cycle in the WBS parent tree (each node has at most one parent, so cycles are simple loops),
 * deterministically. Nodes are explored in sorted-key order; returns the cycle's keys, or null if acyclic.
 */
function findParentCycle(parentOf: ReadonlyMap<string, string | null>): string[] | null {
  const done = new Set<string>();
  for (const start of [...parentOf.keys()].sort()) {
    if (done.has(start)) continue;
    const path: string[] = [];
    const inPath = new Set<string>();
    let node: string | null = start;
    while (node !== null && !done.has(node)) {
      if (inPath.has(node)) return path.slice(path.indexOf(node));
      inPath.add(node);
      path.push(node);
      node = parentOf.get(node) ?? null;
    }
    for (const n of path) done.add(n);
  }
  return null;
}

/**
 * Repair the WBS parent tree (ADR-0038): (a) a `parentKey` not resolving to an in-graph activity → null;
 * (b) a `parentKey` whose target is not a `WBS_SUMMARY` → null; (c) break parent-tree cycles by nulling
 * the lexicographically-largest member's parent until acyclic. Every change is reported.
 */
function repairWbsParents(
  activities: ImportActivity[],
  codeByKey: ReadonlyMap<string, string>,
  findings: ReportFinding[],
): ImportActivity[] {
  const byKey = new Map(activities.map((a) => [a.key, a] as const));
  const summaryKeys = new Set(activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.key));

  // Steps a + b: resolve unresolved / non-summary parents to null.
  const resolved = activities.map((activity) => {
    if (activity.parentKey === null) return activity;
    if (!byKey.has(activity.parentKey)) {
      findings.push({
        kind: 'repair',
        entity: 'wbs',
        sourceRef: activity.key,
        detail: `WBS parent "${activity.parentKey}" of ${activity.code} not found; parent cleared`,
        reason: 'a WBS parent must be an existing activity (ADR-0038)',
      });
      return { ...activity, parentKey: null };
    }
    if (!summaryKeys.has(activity.parentKey)) {
      findings.push({
        kind: 'repair',
        entity: 'wbs',
        sourceRef: activity.key,
        detail: `WBS parent of ${activity.code} is not a WBS summary; parent cleared`,
        reason: 'only a WBS_SUMMARY may be a parent (ADR-0038)',
      });
      return { ...activity, parentKey: null };
    }
    return activity;
  });

  // Step c: break parent-tree cycles.
  const parentOf = new Map(resolved.map((a) => [a.key, a.parentKey] as const));
  // Each iteration nulls exactly one parent, so this terminates within the node count.
  for (let guard = 0; guard <= resolved.length; guard += 1) {
    const cycle = findParentCycle(parentOf);
    if (cycle === null) break;
    const victim = [...cycle].sort().at(-1);
    if (victim === undefined) break;
    parentOf.set(victim, null);
    findings.push({
      kind: 'repair',
      entity: 'wbs',
      sourceRef: victim,
      detail: `WBS parent cycle broken by clearing the parent of ${codeByKey.get(victim) ?? victim}`,
      reason: 'the WBS parent tree must be acyclic (ADR-0038)',
    });
  }

  return resolved.map((activity) => {
    const parentKey = parentOf.get(activity.key) ?? null;
    return parentKey === activity.parentKey ? activity : { ...activity, parentKey };
  });
}

/** Drop any dependency whose predecessor or successor is a `WBS_SUMMARY` (a summary carries no logic). */
function repairSummaryEndpointEdges(
  dependencies: ImportDependency[],
  summaryKeys: ReadonlySet<string>,
  findings: ReportFinding[],
): ImportDependency[] {
  return dependencies.filter((edge) => {
    const predSummary = summaryKeys.has(edge.predecessorKey);
    const succSummary = summaryKeys.has(edge.successorKey);
    if (!predSummary && !succSummary) return true;
    const which =
      predSummary && succSummary ? 'both endpoints' : predSummary ? 'predecessor' : 'successor';
    findings.push({
      kind: 'repair',
      entity: 'relationship',
      sourceRef: edge.key,
      detail: `edge ${edge.predecessorKey}→${edge.successorKey} (${edge.type}) dropped: ${which} is a WBS summary`,
      reason: 'a WBS summary carries no logic (ADR-0038)',
    });
    return false;
  });
}

// ---------------------------------------------------------------------------------------------------------
// Constraints + progress (ADR-0035 §6–§12).
// ---------------------------------------------------------------------------------------------------------

/** Drop an orphaned constraint (a type without a date, or a date without a type) in either slot. */
function repairConstraints(
  activities: ImportActivity[],
  findings: ReportFinding[],
): ImportActivity[] {
  return activities.map((activity) => {
    let { constraintType, constraintDate, secondaryConstraintType, secondaryConstraintDate } =
      activity;
    let changed = false;

    const orphan = (slot: 'primary' | 'secondary'): void => {
      findings.push({
        kind: 'repair',
        entity: 'constraint',
        sourceRef: activity.key,
        detail: `${slot} constraint on ${activity.code} dropped: type and date must both be set`,
        reason: 'a constraint type and date are paired (ADR-0035 §7)',
      });
      changed = true;
    };

    if ((constraintType === null) !== (constraintDate === null)) {
      orphan('primary');
      constraintType = null;
      constraintDate = null;
    }
    if ((secondaryConstraintType === null) !== (secondaryConstraintDate === null)) {
      orphan('secondary');
      secondaryConstraintType = null;
      secondaryConstraintDate = null;
    }

    return changed
      ? {
          ...activity,
          constraintType,
          constraintDate,
          secondaryConstraintType,
          secondaryConstraintDate,
        }
      : activity;
  });
}

/** Derive an activity's status from its actuals (the domain's `deriveStatus`, ADR-0035 §6). */
function deriveStatus(
  percentComplete: number,
  actualStart: string | null,
  actualFinish: string | null,
): CanonicalActivityStatus {
  if (actualFinish !== null || percentComplete >= 100) return 'COMPLETE';
  if (actualStart !== null || percentComplete > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Repair progress the domain services would otherwise fix / the DB CHECKs would reject (ADR-0035 §6):
 * clamp percents to `[0, 100]`; on a complete activity synthesise a missing actual finish from the data
 * date (N08) and zero any positive remaining (N18); drop a `resumeDate` before its `suspendDate`; then
 * re-derive `status` from the (repaired) actuals. Status derivation is not itself a reported deviation.
 */
function repairProgress(
  activities: ImportActivity[],
  dataDate: string,
  findings: ReportFinding[],
): ImportActivity[] {
  return activities.map((activity) => {
    if (activity.progress === null) return activity;
    const p = { ...activity.progress };
    let changed = false;

    const clampedPct = clampPercent(p.percentComplete);
    if (clampedPct !== p.percentComplete) {
      findings.push({
        kind: 'repair',
        entity: 'progress',
        sourceRef: activity.key,
        detail: `percent-complete ${p.percentComplete} on ${activity.code} clamped to ${clampedPct}`,
        reason: 'percent complete must be within [0, 100] (ADR-0035 §6)',
      });
      p.percentComplete = clampedPct;
      changed = true;
    }
    if (p.physicalPercentComplete !== null) {
      const clampedPhys = clampPercent(p.physicalPercentComplete);
      if (clampedPhys !== p.physicalPercentComplete) {
        findings.push({
          kind: 'repair',
          entity: 'progress',
          sourceRef: activity.key,
          detail: `physical percent-complete ${p.physicalPercentComplete} on ${activity.code} clamped to ${clampedPhys}`,
          reason: 'physical percent complete must be within [0, 100] (ADR-0042)',
        });
        p.physicalPercentComplete = clampedPhys;
        changed = true;
      }
    }

    const isComplete =
      p.status === 'COMPLETE' || p.actualFinish !== null || p.percentComplete >= 100;

    // N08 — complete without an actual finish: repair the finish to the data date + warn.
    if (isComplete && p.actualFinish === null) {
      p.actualFinish = dataDate;
      findings.push({
        kind: 'repair',
        entity: 'progress',
        sourceRef: activity.key,
        detail: `${activity.code} is complete without an actual finish; set to the data date (${dataDate})`,
        reason: 'a complete activity needs an actual finish (N08, ADR-0035 §6)',
      });
      changed = true;
    }
    // N18 — remaining > 0 on a complete activity: repair remaining to 0 + warn.
    if (isComplete && p.remainingDurationMinutes !== null && p.remainingDurationMinutes > 0) {
      p.remainingDurationMinutes = 0;
      findings.push({
        kind: 'repair',
        entity: 'progress',
        sourceRef: activity.key,
        detail: `${activity.code} is complete with remaining duration > 0; remaining set to 0`,
        reason: 'a complete activity has no remaining duration (N18, ADR-0035 §6)',
      });
      changed = true;
    }
    // A resume may not precede its suspend: drop the resume.
    if (p.resumeDate !== null && p.suspendDate !== null && p.resumeDate < p.suspendDate) {
      findings.push({
        kind: 'repair',
        entity: 'progress',
        sourceRef: activity.key,
        detail: `resume date on ${activity.code} precedes its suspend date; resume cleared`,
        reason: 'a resume date cannot precede its suspend date (ADR-0035 §6)',
      });
      p.resumeDate = null;
      changed = true;
    }

    // Status is always derived from the (repaired) actuals — a canonical derivation, not a reported change.
    const derived = deriveStatus(p.percentComplete, p.actualStart, p.actualFinish);
    if (derived !== p.status) {
      p.status = derived;
      changed = true;
    }

    return changed ? { ...activity, progress: p } : activity;
  });
}

// ---------------------------------------------------------------------------------------------------------
// Resources + assignments (ADR-0039/0040).
// ---------------------------------------------------------------------------------------------------------

/**
 * Repair the resource library + assignments (ADR-0039/0040): null an unresolved resource calendar; drop
 * assignments whose activity/resource does not resolve; de-duplicate `(activity, resource)` pairs; demote
 * a `MATERIAL` driver; keep at most one driver per activity (first wins). Every change is reported.
 */
function repairResourcesAndAssignments(
  resources: ImportResource[],
  assignments: ImportAssignment[],
  activityKeys: ReadonlySet<string>,
  calendarKeys: ReadonlySet<string>,
  findings: ReportFinding[],
): { resources: ImportResource[]; assignments: ImportAssignment[] } {
  // (e) Resolve resource calendar references.
  const resolvedResources = resources.map((resource) => {
    if (resource.calendarKey !== null && !calendarKeys.has(resource.calendarKey)) {
      findings.push({
        kind: 'repair',
        entity: 'resource',
        sourceRef: resource.key,
        detail: `resource "${resource.name}" calendar "${resource.calendarKey}" not found; calendar cleared`,
        reason: 'unresolved resource calendar reference (ADR-0039)',
      });
      return { ...resource, calendarKey: null };
    }
    return resource;
  });
  const resourceKeys = new Set(resolvedResources.map((r) => r.key));
  const kindByKey = new Map(resolvedResources.map((r) => [r.key, r.kind] as const));

  // (c) Drop assignments with an unresolved endpoint.
  let result = assignments.filter((assignment) => {
    const missingActivity = !activityKeys.has(assignment.activityKey);
    const missingResource = !resourceKeys.has(assignment.resourceKey);
    if (!missingActivity && !missingResource) return true;
    const which =
      missingActivity && missingResource
        ? 'activity and resource'
        : missingActivity
          ? 'activity'
          : 'resource';
    findings.push({
      kind: 'repair',
      entity: 'assignment',
      sourceRef: assignment.key,
      detail: `assignment ${assignment.activityKey}↦${assignment.resourceKey} dropped: ${which} not found`,
      reason: 'an assignment endpoint does not exist (ADR-0039)',
    });
    return false;
  });

  // (d) De-duplicate (activity, resource) pairs, keeping the first.
  const seenPair = new Set<string>();
  result = result.filter((assignment) => {
    const signature = `${assignment.activityKey}::${assignment.resourceKey}`;
    if (!seenPair.has(signature)) {
      seenPair.add(signature);
      return true;
    }
    findings.push({
      kind: 'repair',
      entity: 'assignment',
      sourceRef: assignment.key,
      detail: `duplicate assignment of resource ${assignment.resourceKey} to activity ${assignment.activityKey} dropped`,
      reason: 'an activity may be assigned a resource once (ADR-0039)',
    });
    return false;
  });

  // (b) A MATERIAL resource can never drive.
  result = result.map((assignment) => {
    if (assignment.isDriving && kindByKey.get(assignment.resourceKey) === 'MATERIAL') {
      findings.push({
        kind: 'repair',
        entity: 'assignment',
        sourceRef: assignment.key,
        detail: `driving flag cleared on ${assignment.activityKey}↦${assignment.resourceKey}: a MATERIAL resource cannot drive`,
        reason: 'a MATERIAL resource can never drive an activity (ADR-0039)',
      });
      return { ...assignment, isDriving: false };
    }
    return assignment;
  });

  // (a) At most one driving assignment per activity (first wins; the rest are demoted).
  const drivingSeen = new Set<string>();
  result = result.map((assignment) => {
    if (!assignment.isDriving) return assignment;
    if (!drivingSeen.has(assignment.activityKey)) {
      drivingSeen.add(assignment.activityKey);
      return assignment;
    }
    findings.push({
      kind: 'repair',
      entity: 'assignment',
      sourceRef: assignment.key,
      detail: `driving flag cleared on ${assignment.activityKey}↦${assignment.resourceKey}: activity already has a driver`,
      reason: 'at most one driving assignment per activity (ADR-0039)',
    });
    return { ...assignment, isDriving: false };
  });

  return { resources: resolvedResources, assignments: result };
}

// ---------------------------------------------------------------------------------------------------------
// Calendar windows (ADR-0036 §2) + the standard working day (ADR-0068).
// ---------------------------------------------------------------------------------------------------------

/**
 * The smallest standard working day the domain accepts, in hours — the `@Min(0.25)` on the public
 * calendar DTOs. Stated here because the importer **bypasses those DTOs**: it persists in bulk, so a
 * bound only the DTO knows about is a bound the import path does not have.
 *
 * The failure it closes is quiet. `hours_per_day_minutes` is stored as `Math.round(hours × 60)`, so a
 * source file carrying a `day_hr_cnt` of, say, `0.004` rounds to **zero** minutes and hits the column's
 * own CHECK — a 500 during commit, naming a constraint rather than a calendar.
 */
const MIN_HOURS_PER_DAY = 0.25;

/**
 * Sort, drop-empty and merge one day's working windows, reporting each change.
 *
 * The engine's `buildWorkingTimeCalendar` asserts that windows are in-bounds, ordered and
 * non-overlapping, and the public DTO's `AreWindowsOrdered` **rejects** a violation at the boundary so
 * a planner is told which pair they got wrong. An import has neither of those: it writes the rows the
 * mapper produced straight to storage, so a source file whose windows overlap surfaces as an opaque
 * 500 from a recalculation days later, pointing at the plan rather than at the file.
 *
 * So this repairs rather than rejects — the choice every other import approximation already makes, and
 * the right one here because the shape is almost always a source-side artefact (P6 emits per-shift rows
 * with no cross-row ordering guarantee) rather than something the importing organisation could fix.
 * Merging is deliberate over clipping: two overlapping windows describe working time, and taking their
 * union preserves every minute either of them claimed. A window with `start >= end` claims none, so it
 * goes.
 */
function repairDayWindows(
  windows: readonly ImportWorkWindow[],
  report: (detail: string, reason: string) => void,
  where: string,
): ImportWorkWindow[] {
  const usable = windows.filter((w) => {
    if (w.startMinute < w.endMinute) return true;
    report(
      `${where}: empty window ${w.startMinute}–${w.endMinute} dropped`,
      'a working window must start before it ends (ADR-0036 §2)',
    );
    return false;
  });

  const sorted = [...usable].sort((a, b) =>
    a.startMinute !== b.startMinute ? a.startMinute - b.startMinute : a.endMinute - b.endMinute,
  );
  const reordered = sorted.some((w, i) => w !== usable[i]);
  if (reordered) {
    report(
      `${where}: windows re-ordered by start time`,
      'working windows are stored in start order within a day (ADR-0036 §2)',
    );
  }

  const merged: ImportWorkWindow[] = [];
  for (const window of sorted) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && window.startMinute < previous.endMinute) {
      const endMinute = Math.max(previous.endMinute, window.endMinute);
      report(
        `${where}: overlapping windows ${previous.startMinute}–${previous.endMinute} and ` +
          `${window.startMinute}–${window.endMinute} merged into ${previous.startMinute}–${endMinute}`,
        'working windows within a day may not overlap (ADR-0036 §2)',
      );
      merged[merged.length - 1] = { startMinute: previous.startMinute, endMinute };
      continue;
    }
    merged.push(window);
  }
  return merged;
}

/** Weekday names for a finding a planner has to act on — `weekday 3` names nothing they can see. */
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * Repair each calendar's weekly pattern and dated exception windows, and its standard working day.
 * Shifts are repaired **per weekday** — the array covers the whole week, and ordering is only defined
 * within a day (a Tuesday window is not "after" a Monday one).
 */
function repairCalendars(calendars: ImportCalendar[], findings: ReportFinding[]): ImportCalendar[] {
  return calendars.map((calendar) => {
    const report = (detail: string, reason: string): void => {
      findings.push({
        kind: 'repair',
        entity: 'calendar',
        sourceRef: calendar.key,
        detail: `calendar "${calendar.name}" ${detail}`,
        reason,
      });
    };

    const byWeekday = new Map<number, ImportWorkWindow[]>();
    for (const shift of calendar.shifts) {
      const day = byWeekday.get(shift.weekday);
      if (day === undefined) byWeekday.set(shift.weekday, [shift]);
      else day.push(shift);
    }
    const shifts = [...byWeekday.keys()]
      .sort((a, b) => a - b)
      .flatMap((weekday) =>
        repairDayWindows(
          byWeekday.get(weekday) ?? [],
          report,
          WEEKDAY_NAMES[weekday] ?? `weekday ${String(weekday)}`,
        ).map((window) => ({ ...window, weekday })),
      );

    const exceptions = calendar.exceptions.map((exception) => ({
      ...exception,
      windows: repairDayWindows(exception.windows, report, `exception ${exception.startDate}`),
    }));

    let { hoursPerDay } = calendar;
    if (hoursPerDay !== undefined && hoursPerDay < MIN_HOURS_PER_DAY) {
      report(
        `standard working day of ${hoursPerDay} h raised to ${MIN_HOURS_PER_DAY} h`,
        `a standard working day below ${MIN_HOURS_PER_DAY} h rounds to zero stored minutes (ADR-0068)`,
      );
      hoursPerDay = MIN_HOURS_PER_DAY;
    }

    return {
      ...calendar,
      shifts,
      exceptions,
      ...(hoursPerDay === undefined ? {} : { hoursPerDay }),
    };
  });
}

/** Validate + repair the import graph, producing a domain-valid, acyclic graph and its findings. */
export function validateAndRepair(graph: ImportGraph): ValidateResult {
  const findings: ReportFinding[] = [];

  let activities = repairDuplicateCodes(graph.activities, findings);
  const activityKeys = new Set(activities.map((a) => a.key));
  const codeByKey = new Map(activities.map((a) => [a.key, a.code] as const));

  activities = repairWbsParents(activities, codeByKey, findings);
  activities = repairConstraints(activities, findings);
  activities = repairProgress(activities, graph.plan.dataDate, findings);

  const summaryKeys = new Set(activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.key));
  let dependencies = repairDanglingEdges(graph.dependencies, activityKeys, findings);
  dependencies = repairSummaryEndpointEdges(dependencies, summaryKeys, findings);
  dependencies = repairDuplicateEdges(dependencies, findings);
  dependencies = repairCycles(dependencies, codeByKey, findings);

  const calendars = repairCalendars(graph.calendars, findings);
  const calendarKeys = new Set(calendars.map((c) => c.key));
  const { resources, assignments } = repairResourcesAndAssignments(
    graph.resources,
    graph.assignments,
    activityKeys,
    calendarKeys,
    findings,
  );

  return {
    graph: { ...graph, calendars, activities, dependencies, resources, assignments },
    findings,
  };
}
