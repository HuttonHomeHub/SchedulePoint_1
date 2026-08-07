/**
 * The canvas selection, as a **set with a primary** (spec `docs/specs/canvas-multi-select/` M0-T2,
 * behind `VITE_CANVAS_MULTI_SELECT`).
 *
 * Pure: no React, no DOM, no canvas, no network — a sibling of `render-model` and `gesture-machine`,
 * and testable the same way. Every selection path in the canvas calls one of these reducers, so
 * there is exactly one answer to "what does clicking that do".
 *
 * **Why a set with a primary rather than just a set.** Several things the canvas already does are
 * singular by nature and stay that way: the edge handles resize *one* bar, the activity panel shows
 * *one* record, and `aria-activedescendant` names *one* option. Modelling that as "the set, plus
 * which member is the subject" keeps those consumers honest — they read `primaryId` and get exactly
 * what they got before — instead of each inventing its own rule for which member of a set it means.
 *
 * **The primary is the most recently added survivor, never an index.** An index into a set that
 * shrinks is a bug waiting for the right delete; "the last one the planner touched that is still
 * here" is a rule a planner can predict without being told it.
 *
 * `reconcile` is **derived, never an effect** — the `ActivitiesTable` rule (ADR-0063 M4b): an id
 * that leaves the plan leaves the selection at read time, so no effect can race a delete and no
 * render can briefly show a selection of something that is gone.
 */

/** A canvas selection: the chosen ids in the order they were added, plus which one is the subject. */
export interface CanvasSelection {
  /** Selected ids, oldest first. Never contains duplicates. */
  readonly ids: readonly string[];
  /** The subject of singular affordances (edge handles, the panel, `aria-activedescendant`). Null
   *  exactly when `ids` is empty. */
  readonly primaryId: string | null;
}

/** The empty selection. A shared frozen value, so an idle canvas allocates nothing per render. */
export const EMPTY_SELECTION: CanvasSelection = Object.freeze({
  ids: Object.freeze([]),
  primaryId: null,
});

/** Build a selection from ids, de-duplicated, with the last as primary. Internal to this module. */
function build(ids: readonly string[]): CanvasSelection {
  const unique: string[] = [];
  for (const id of ids) if (!unique.includes(id)) unique.push(id);
  return unique.length === 0
    ? EMPTY_SELECTION
    : { ids: unique, primaryId: unique[unique.length - 1] ?? null };
}

/** Is this id selected? */
export function isSelected(selection: CanvasSelection, id: string): boolean {
  return selection.ids.includes(id);
}

/**
 * Replace the selection with exactly this one id — a plain click, and **the only reducer other than
 * {@link clear} that is reachable with the flag off**. That is what makes flag-off structurally
 * singular rather than singular by convention.
 */
export function replace(id: string): CanvasSelection {
  return { ids: [id], primaryId: id };
}

/** Clear the selection — a plain click on empty ground, or Escape. */
export function clear(): CanvasSelection {
  return EMPTY_SELECTION;
}

/**
 * Toggle one id in or out — ctrl/cmd-click.
 *
 * Adding makes it the primary, because the planner just pointed at it. Removing the primary falls
 * back to the most recently added survivor, which is why `ids` keeps insertion order rather than
 * being a `Set`: a `Set` would give iteration order for free and lose the "most recent" part, and
 * "most recent" is the whole rule.
 */
export function toggle(selection: CanvasSelection, id: string): CanvasSelection {
  return isSelected(selection, id)
    ? build(selection.ids.filter((existing) => existing !== id))
    : build([...selection.ids, id]);
}

/**
 * Add many ids at once, keeping what is already selected — a marquee with a modifier, or
 * select-all. The last of `ids` that was not already selected becomes the primary; if every one was
 * already selected the primary does not move, because nothing was added.
 */
export function addAll(selection: CanvasSelection, ids: readonly string[]): CanvasSelection {
  return build([...selection.ids, ...ids]);
}

/**
 * Set the selection to exactly these ids — a marquee without a modifier, and the shape
 * shift-click's span resolves to once its rectangle has been turned into a member list.
 *
 * Deliberately **not** `addAll(clear(), ids)`: an empty `ids` here means "you swept an empty patch",
 * which is a clear, and routing it through one function makes that unambiguous.
 */
export function replaceAll(ids: readonly string[]): CanvasSelection {
  return build(ids);
}

/**
 * Drop ids that are no longer selectable, and repair the primary.
 *
 * Called at **read** time from the live activity list, never from an effect (the ADR-0063 M4b rule).
 * An effect would run after a render, so for one frame the canvas could ring a bar that has been
 * deleted — and worse, a bulk action fired in that frame would name it.
 *
 * Returns the **same object** when nothing was dropped, so an unchanged selection cannot churn a
 * memo or a render downstream.
 */
export function reconcile(
  selection: CanvasSelection,
  selectableIds: ReadonlySet<string>,
): CanvasSelection {
  const kept = selection.ids.filter((id) => selectableIds.has(id));
  if (kept.length === selection.ids.length) return selection;
  return build(kept);
}
