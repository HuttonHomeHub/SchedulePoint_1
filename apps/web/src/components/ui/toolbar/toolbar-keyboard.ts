/**
 * **Which navigation keys a focused control has already claimed, and which the roving toolbar may
 * take.** Shared by {@link Deck} and {@link Toolbar}, which is the whole point of the module.
 *
 * ## Why this exists as one function in one file
 *
 * Both primitives put a roving `tabindex` across their items and listen for the six navigation keys
 * on the container. Both accept `render` items supplying **arbitrary markup**, so both can end up
 * with a focused descendant that needs those keys for itself. They had **two copies of the rule**,
 * and the copies drifted the moment one was fixed: a WCAG 2.2 §2.1.1 defect was closed in `Deck`
 * and left standing in `Toolbar`, whose copy still vetoed all six keys under a docblock describing
 * the deck's search field. That is the "one correct pattern applied to a control and not its
 * neighbour" shape this repository has recorded in five consecutive epics (ADR-0064 §7).
 *
 * ## The rule, and why it is three cases rather than two
 *
 * A tag-name test is **not** sufficient, and shipping one caused a live regression:
 *
 * - **Text entry** (`text`, `search`, `email`, `tel`, `url`, `password`, and an absent/unknown
 *   `type`, which the DOM reflects as `text`) owns the **caret** keys — ArrowLeft, ArrowRight, Home
 *   and End — and nothing else. A single-line field does nothing with the vertical arrows, so the
 *   toolbar keeps them, and they are the **only** route out of a field that is also the roving stop.
 *   Vetoing them too is what made 18 of the deck's 27 commands unreachable by keyboard
 *   (`docs/TECH_DEBT.md` #189).
 * - **Value-stepping and group-navigating controls** own **all six**. `date`, `datetime-local`,
 *   `month`, `time` and `week` step the focused segment with ArrowUp/ArrowDown; `number` and
 *   `range` step the value; `radio` moves selection within its group. A `<textarea>`, a `<select>`
 *   and a contenteditable navigate vertically for the same reason. Narrowing the veto to the caret
 *   keys **broke the shipped `Go to date` control** (`tsld-toolbar-items.tsx`, `row: 'strip'`, so
 *   `Deck` renders it): pressing ArrowUp in its date field moved roving focus to another command
 *   instead of changing the day — worse than the defect being fixed, because it destroys an open
 *   interaction rather than merely failing to leave one (`docs/TECH_DEBT.md` #192).
 * - **Everything else** — `checkbox`, `button`, `submit`, `file`, and any non-form element — claims
 *   nothing. The arrows belong to the toolbar.
 *
 * `HTMLInputElement.type` is used rather than the raw attribute deliberately: the DOM normalises
 * case and reflects an unknown or absent type as `text`, so a typo cannot silently land a control
 * in the permissive branch.
 *
 * ## What this function deliberately does NOT decide
 *
 * Whether a **descendant component** has already handled the key. That is `event.defaultPrevented`,
 * which the containers check separately and first — a `ToolbarSplitButton` caret, a `Menu` or a
 * `Combobox` calls `preventDefault()` without `stopPropagation()`, so the event still reaches the
 * container through the React tree (including from a portal, which follows the React tree and not
 * the DOM). Deciding that here would mean this function taking the event rather than the target,
 * and the two questions are genuinely different: this one is "what does the focused control need?",
 * that one is "has someone already answered?".
 */

/** The six keys the roving model uses. Exported so a container cannot drift from this list. */
export const TOOLBAR_NAV_KEYS: readonly string[] = [
  'ArrowRight',
  'ArrowLeft',
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
];

/** Keys a single-line text field needs for its caret. */
const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * `<input>` types that own **every** navigation key: the four above plus both vertical arrows,
 * which they use to step a value, a date segment, or a selection within a group.
 */
const OWNS_ALL_KEYS = new Set([
  'date',
  'datetime-local',
  'month',
  'number',
  'radio',
  'range',
  'time',
  'week',
]);

/** `<input>` types that own the caret keys only. */
const TEXT_ENTRY = new Set(['email', 'password', 'search', 'tel', 'text', 'url']);

/**
 * Does the control at `target` need `key` for itself, so the toolbar must not take it?
 *
 * See the module docblock — the three cases and the defect each of them exists to prevent.
 */
export function vetoesKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;

  // `.type` rather than `getAttribute('type')`: the DOM lower-cases it and reflects an absent or
  // unrecognised value as `text`, so an unknown type lands in the conservative branch, not the
  // permissive one.
  const type = (target as HTMLInputElement).type;
  if (OWNS_ALL_KEYS.has(type)) return true;
  if (TEXT_ENTRY.has(type)) return CARET_KEYS.has(key);
  return false;
}

/**
 * Has a descendant already handled this key, or is an IME mid-composition?
 *
 * Both are reasons for the container to stand down, and neither is a property of the focused
 * element, which is why they are not in {@link vetoesKey}. `isComposing` matters because the
 * vertical arrows are now live over a text field, and some input methods use them to walk a
 * candidate list while composing.
 */
export function containerShouldStandDown(event: {
  defaultPrevented: boolean;
  nativeEvent: { isComposing?: boolean };
}): boolean {
  return event.defaultPrevented || event.nativeEvent.isComposing === true;
}
