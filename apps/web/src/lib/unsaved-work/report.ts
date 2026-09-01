/**
 * What "unsaved work" IS, as data — the one derivation both readers share.
 *
 * **Why a report of scopes and not a boolean.** ADR-0060 saves per *write scope*, not per dialog:
 * definition edits need the ADR-0028 pen, progress edits deliberately do not, and steps joined the
 * pen side. The activity editor alone holds six independently-dirty forms across those scopes. A
 * single `isDirty` flattens them, and a flattened answer is wrong in both directions — it cannot
 * name what is at risk, and it cannot tell work that could still be saved from work that cannot.
 *
 * **`savable` carries the product owner's CQ-2 answer** (2026-08-23): when the pen is lost
 * mid-edit the work is unsaved *and unsavable*, and the reader is warned anyway, with copy that
 * says so. Letting them go silently would lose the work with no acknowledgement it existed, which
 * reads as the application discarding an edit rather than the lock being taken. The two design
 * passes had to be merged here: one proposed `{ key, label, savable }` and the other
 * `{ label, subject }` with no way to express it.
 *
 * Pure — no React, no router. The provider holds these; the navigation guard and the in-editor
 * confirmation both READ them, so the two cannot drift. ADR-0065's `routeOrthogonal` argument
 * applied literally: a second implementation drifts, and the drift is invisible because each looks
 * right alone.
 */

/** One independently-dirty write scope within a surface. */
export interface UnsavedScope {
  /** Stable within its surface. Used for identity, never shown. */
  readonly key: string;
  /** How the scope is named to the reader — matches the editor's tab labels. */
  readonly label: string;
  /**
   * Could this work still be persisted if the reader stayed? `false` when the scope is dirty but
   * no longer writable — the ADR-0028 pen taken mid-edit is the case that produces it.
   */
  readonly savable: boolean;
}

/** One surface's contribution to the registry. */
export interface UnsavedWorkReport {
  /** What holds the work, for copy that spans more than one surface. */
  readonly subject: string;
  readonly scopes: readonly UnsavedScope[];
}

/** A scope that may or may not be in the report, depending on {@link when}. */
export interface UnsavedScopeCandidate extends UnsavedScope {
  /** Include this scope? Typically a form's `isDirty`, or a value comparison. */
  readonly when: boolean;
}

/**
 * Assemble a report from candidates, keeping the ones whose {@link UnsavedScopeCandidate.when} is
 * true.
 *
 * **Why a helper rather than four conditional spreads** (`docs/TECH_DEBT.md` #184). The four call
 * sites had **fourteen** occurrences of `...(cond ? [{ key, label, savable }] : [])` between them
 * — six in the activity editor alone. Every one was correct; the idiom is the risk, because it
 * buries the condition inside array-spread punctuation where a misplaced bracket reads as
 * formatting rather than as a scope that can never be reported. ADR-0074 records that exact shape
 * going wrong elsewhere (`...(FLAG ? [route] : [])` widens to include the route in BOTH branches,
 * so typecheck cannot catch it).
 *
 * Written as a declarative list, a reader compares conditions down one column instead of parsing
 * a spread per line, and the assembly is independently testable rather than re-derived per dialog.
 */
export function buildReport(
  subject: string,
  candidates: readonly UnsavedScopeCandidate[],
): UnsavedWorkReport {
  return {
    subject,
    // Rebuilt rather than spread, so a `when` cannot leak into the report a consumer reads. The
    // extra field is harmless today and would be one more thing a future `UnsavedScope` consumer
    // has to know not to trust.
    scopes: candidates
      .filter((c) => c.when)
      .map((c) => ({ key: c.key, label: c.label, savable: c.savable })),
  };
}

export function hasUnsavedWork(reports: readonly UnsavedWorkReport[]): boolean {
  return reports.some((r) => r.scopes.length > 0);
}

/** The scopes that can no longer be saved — what makes the copy honest rather than hopeful. */
export function unsavableScopes(reports: readonly UnsavedWorkReport[]): readonly UnsavedScope[] {
  return reports.flatMap((r) => r.scopes.filter((s) => !s.savable));
}

function labelsOf(reports: readonly UnsavedWorkReport[]): string[] {
  return reports.flatMap((r) => r.scopes.map((s) => s.label));
}

/**
 * Past this many names, print the count first (`docs/TECH_DEBT.md` #184). The activity editor holds
 * **six** independently-dirty scopes, and all six produced one unpunctuated comma list —
 * "General, Scheduling, Cost, Reported progress, How value is measured, Weighted steps have unsaved
 * changes." — read aloud as one breath, with the number a reader most wants left for them to count.
 * Four is where a list stops being a phrase; it is the same move ADR-0094 made for its offenders.
 */
const COUNT_BEFORE_LIST_AT = 4;

/**
 * "A", "A and B", "A, B and C" — the English list, used by BOTH branches of the sentence below.
 *
 * The multi-surface branch already said "and" and the per-scope branch did not, so the same
 * confirmation read two different ways depending on how many surfaces were dirty. One helper is
 * what stops that recurring.
 */
function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The subject phrase: a list, or a count and then the list once the list is too long to be one. */
function nameScopes(labels: readonly string[]): string {
  if (labels.length < COUNT_BEFORE_LIST_AT) {
    return `${joinWithAnd(labels)} ${labels.length === 1 ? 'has' : 'have'} unsaved changes.`;
  }
  return `${labels.length} sections have unsaved changes: ${joinWithAnd(labels)}.`;
}

/**
 * The sentence both the navigation guard and the in-editor confirmation print.
 *
 * It reproduced the editor's existing FIRST SENTENCE exactly when it was written — including the
 * `has`/`have` agreement that copy already got right — which is what made replacing that copy with
 * a call to this provably a no-op at the time. **That is history, not a contract**: the list now
 * carries an "and" and, past {@link COUNT_BEFORE_LIST_AT} names, its own count
 * (`docs/TECH_DEBT.md` #184).
 *
 * The caller appends its own action clause (`Closing will discard them.`, `Switching to X will
 * discard them.`, and the guard's own). That is not an omission: only the caller knows which action
 * it is confirming, and folding it in here would mean a parameter per future caller.
 */
export function describeUnsavedWork(reports: readonly UnsavedWorkReport[]): string {
  const labels = labelsOf(reports);
  if (labels.length === 0) return '';

  const surfaces = reports.filter((r) => r.scopes.length > 0);
  // More than one surface holds work: naming six scopes across two subjects is a list nobody reads,
  // so name the subjects instead. Single surface keeps the established per-scope wording.
  const subject =
    surfaces.length > 1
      ? `${joinWithAnd(surfaces.map((r) => r.subject))} have unsaved changes.`
      : nameScopes(labels);

  const unsavable = unsavableScopes(reports);
  if (unsavable.length === 0) return subject;
  // Every dirty scope is unsavable: say so plainly rather than implying a Save they cannot reach.
  if (unsavable.length === labels.length) {
    return `${subject} They can no longer be saved, because you no longer hold the edit lock.`;
  }
  const names = joinWithAnd(unsavable.map((s) => s.label));
  return `${subject} ${names} can no longer be saved, because you no longer hold the edit lock.`;
}
