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
 * The sentence both the navigation guard and the in-editor confirmation print.
 *
 * Reproduces the editor's existing FIRST SENTENCE exactly for the single-surface case — including
 * the `has`/`have` agreement it already gets right (`ActivityEditorDialog.tsx:856-863`) — so
 * replacing that copy with a call to this is provably a no-op for the three scopes that already
 * worked, and the change is visible only in the three that were silently omitted.
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
      ? `${surfaces.map((r) => r.subject).join(' and ')} have unsaved changes.`
      : `${labels.join(', ')} ${labels.length === 1 ? 'has' : 'have'} unsaved changes.`;

  const unsavable = unsavableScopes(reports);
  if (unsavable.length === 0) return subject;
  // Every dirty scope is unsavable: say so plainly rather than implying a Save they cannot reach.
  if (unsavable.length === labels.length) {
    return `${subject} They can no longer be saved, because you no longer hold the edit lock.`;
  }
  const names = unsavable.map((s) => s.label).join(', ');
  return `${subject} ${names} can no longer be saved, because you no longer hold the edit lock.`;
}
