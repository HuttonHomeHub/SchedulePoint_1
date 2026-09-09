import type { RevisionEdge, RevisionRow } from './revision-delta';

/**
 * **Correlating two INDEPENDENTLY IMPORTED plans, so a delta can be taken across them.**
 *
 * `computeRevisionDelta` correlates on `RevisionRow.activityId` through two `Map`s, and its own
 * docblock records that it cannot tell which side came from `baseline_activities` and which from
 * `activities` — which is exactly why ADR-0125 got baseline-vs-baseline for free. **A cross-plan
 * comparison is a change of what fills that slot, and nothing else.** This module fills it, and the
 * delta, the classifier and the ghost builder are reused unmodified.
 *
 * **The file is named `revision-*` deliberately.** `revision-sources.ts` derives its roster by that
 * prefix, so both existing structural gates — engine-free, and no-cause — cover this module the
 * moment it exists, with no roster to edit and therefore no roster to forget. Proven rather than
 * asserted: a scratch `import { computeSchedule }` was added and
 * `revision-delta-engine-free.structural.spec.ts` went red.
 *
 * **The parity sentence is ADR-0125 D1's strong form:** `computeSchedule` is not called, not
 * imported, and not reachable from this module's graph. ADR-0116 D7's weaker sibling — "computes
 * read-only, persists nothing" — does **not** apply here and must never be swapped in for it.
 */

/** What a correlation could not place, reported rather than inferred (spec §2.4 D1b). */
export interface CorrelationCounts {
  readonly matched: number;
  /** Coded rows present on the FROM side only. Removed — or re-coded, which is indistinguishable. */
  readonly fromUnmatched: number;
  /** Coded rows present on the TO side only. Added — or re-coded. */
  readonly toUnmatched: number;
  /** Rows with no code at all. Neither added nor removed: the product does not know. */
  readonly fromUncoded: number;
  readonly toUncoded: number;
}

export interface CorrelatedSides {
  readonly from: readonly RevisionRow[];
  readonly to: readonly RevisionRow[];
  readonly counts: CorrelationCounts;
}

/**
 * The shared key a correlated pair is presented under.
 *
 * It is the **code itself**, not a synthesised id, and that is worth stating: every consumer
 * downstream treats `activityId` as opaque, and using the code keeps a row traceable to its subject
 * when a report is read months later. Nothing downstream parses it.
 */
const keyOf = (code: string): string => code;

/**
 * **D1a — matched EXACTLY.** No case folding, no trimming, no punctuation normalisation.
 *
 * `uq_activities_plan_code` is a plain btree on `text` and is therefore **case-sensitive**, so
 * `EXC-100` and `exc-100` are two activities the product permits inside one plan. Folding the
 * correlation key would map them onto one key and manufacture a duplicate the database deliberately
 * allows — inventing the very collision `#0.1` establishes cannot otherwise occur.
 *
 * ADR-0073 C2.1's `toLowerCase()` precedent does **not** transfer. There the stored user row is
 * itself lowercased, so folding restores an equivalence the data already asserts; here nothing is
 * folded anywhere, so folding would invent one.
 */
export function correlateByCode(
  from: readonly RevisionRow[],
  to: readonly RevisionRow[],
): CorrelatedSides {
  const fromCoded = from.filter((r) => r.code !== null);
  const toCoded = to.filter((r) => r.code !== null);

  // D1c — a duplicate within one side is refused by `uq_activities_plan_code` and is therefore not a
  // case to repair here. The obligation that leaves is a TEST, not a branch: an API e2e case asserts
  // the index still exists with its partial predicate, so a migration relaxing it turns this feature
  // red instead of silently handing the correlation two rows for one key.
  const toByCode = new Map(toCoded.map((r) => [r.code as string, r]));
  const fromCodes = new Set(fromCoded.map((r) => r.code as string));

  const outFrom: RevisionRow[] = [];
  const outTo: RevisionRow[] = [];
  let matched = 0;

  for (const f of fromCoded) {
    const code = f.code as string;
    const t = toByCode.get(code);
    if (t === undefined) {
      // D1d — present on one side only. Reported as removed, and the ambiguity with a re-code is
      // stated by the caller rather than resolved here, because it is genuinely unresolvable.
      outFrom.push({ ...f, activityId: keyOf(code) });
      continue;
    }
    matched += 1;
    outFrom.push({ ...f, activityId: keyOf(code) });
    outTo.push({ ...t, activityId: keyOf(code) });
  }

  for (const t of toCoded) {
    const code = t.code as string;
    if (!fromCodes.has(code)) outTo.push({ ...t, activityId: keyOf(code) });
  }

  return {
    from: outFrom,
    to: outTo,
    counts: {
      matched,
      fromUnmatched: fromCoded.length - matched,
      toUnmatched: toCoded.length - matched,
      // D1b — an uncoded row is excluded from the correlation and COUNTED. It is neither an
      // addition nor a removal, because the product does not know which it is, and silence would be
      // the ADR-0126 D4 defect: an absence a reader cannot distinguish from a fact.
      fromUncoded: from.length - fromCoded.length,
      toUncoded: to.length - toCoded.length,
    },
  };
}

/**
 * Edges keyed on `(predecessorCode, successorCode, type)` — a **natural key per side**, which
 * `uq_dependencies_pred_succ_type` already guarantees is unique within a plan.
 *
 * The endpoints are re-expressed as codes for the same reason the rows are: the classifier diffs
 * edges by `predecessorId`/`successorId`, and across two plans those ids name nothing in common. An
 * edge whose endpoint has no code cannot be placed and is dropped from the correlated set — it
 * cannot be compared against anything, and inventing a key for it would assert a relationship
 * between two activities that may not be the same work.
 */
export interface CorrelatedEdges {
  readonly edges: readonly RevisionEdge[];
  /**
   * The correlation key back to the edge's **own plan-local dependency id**, retained because the
   * re-keying destroys it and one consumer needs it back.
   *
   * **The consumer is the canvas.** The overlay's painter resolves an ADDED or CHANGED link by
   * looking its `dependencyId` up among the edges the diagram already draws — so a link handed to
   * it under a correlation key matches nothing and is silently not drawn, while the total still
   * counts it. A picture quietly missing rows nobody is told about is the absence ADR-0127 exists
   * to remove, arriving in the one place a reader cannot check it. A REMOVED link needs no entry
   * here: it is in no live edge list by definition, and the painter routes it from its endpoints.
   *
   * Returned rather than recomputed at the seam, because recomputing means a second copy of the
   * key rule — and two key rules that agree today are the ADR-0065 drift, invisible until they
   * disagree about one edge.
   */
  readonly sourceIdByKey: ReadonlyMap<string, string>;
}

export function correlateEdges(
  edges: readonly RevisionEdge[],
  rows: readonly RevisionRow[],
): CorrelatedEdges {
  const codeById = new Map(rows.filter((r) => r.code !== null).map((r) => [r.activityId, r.code]));
  const out: RevisionEdge[] = [];
  const sourceIdByKey = new Map<string, string>();
  for (const e of edges) {
    const pred = codeById.get(e.predecessorId);
    const succ = codeById.get(e.successorId);
    if (pred === undefined || pred === null || succ === undefined || succ === null) continue;
    const key = JSON.stringify([pred, succ, e.type]);
    sourceIdByKey.set(key, e.dependencyId);
    out.push({
      ...e,
      // The dependency's own id is as plan-local as the endpoints', so it is replaced by the natural
      // key. A reader comparing two reports months apart gets a stable handle rather than a UUID
      // that names a row in one plan only.
      // JSON, not a delimiter. A code may legitimately contain any character — a space, a hyphen,
      // even a quote — so every separator that reads nicely is one a code can forge: `A 10` + `B`
      // and `A` + `10 B` would collide under a space. Encoding the triple removes the question
      // rather than choosing a character nobody has tested against real P6 data.
      dependencyId: key,
      predecessorId: pred,
      successorId: succ,
    });
  }
  return { edges: out, sourceIdByKey };
}
