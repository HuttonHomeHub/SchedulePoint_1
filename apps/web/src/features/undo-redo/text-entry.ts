/**
 * Where a keystroke's undo belongs to the browser rather than to the plan (undo-redo M5, spec §4.7).
 *
 * The test used to be `closest('input, textarea, select, [contenteditable]')`, which also claimed
 * every checkbox, radio and button-type input: focus on a toggle swallowed Ctrl+Z and undid nothing,
 * although a toggle has no native undo to protect.
 *
 * - **Text-entry** — `textarea`, an `input` whose type takes typed characters (text, search, number,
 *   date, time, …), and `contenteditable`. The browser keeps a per-field undo stack there, and
 *   stealing the key would discard what the planner just typed in favour of an unrelated plan edit.
 * - **`select`** — also left alone, per the spec. A select has no edit stack, but type-ahead
 *   selection inside one is keyboard text input, and a plan undo under a half-chosen option would
 *   be a surprise with no upside.
 * - **Everything else** (checkbox, radio, range, colour, file, button-type inputs, buttons, rows,
 *   the canvas) — the plan's undo runs.
 *
 * `input.type` is read as the property, not the attribute: an unknown or missing `type` normalises
 * to `text`, which is the browser's own fallback and therefore the right default.
 */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'file',
  'range',
  'color',
  'hidden',
]);

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // The attribute is read rather than `isContentEditable`, which jsdom does not implement. The
  // empty string and `plaintext-only` are editable; only `false` is not.
  const editable = target.closest('[contenteditable]');
  if (editable !== null && editable.getAttribute('contenteditable') !== 'false') return true;
  if (target.closest('textarea, select') !== null) return true;
  const input = target.closest('input');
  return input !== null && !NON_TEXT_INPUT_TYPES.has(input.type);
}
