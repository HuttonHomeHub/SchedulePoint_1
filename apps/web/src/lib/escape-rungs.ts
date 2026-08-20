/**
 * **An open native modal answers Escape itself, so no rung of the ladder may claim that press.**
 *
 * `Dialog` and `Sheet` are `showModal()`, which puts them in the browser's top layer and gives them
 * the platform's own close-on-Escape. The keydown still **bubbles through the DOM**, though — a
 * modal `<dialog>` is in the top layer for painting and hit-testing, not for event propagation, and
 * it stays exactly where it is in the tree. So every ancestor handler sees the press unless it asks.
 *
 * Getting that wrong costs more than one dismissal. `app-shell.tsx` has asked since ADR-0080: without
 * it, dismissing a dialog also collapsed the drawer behind it — one press, two dismissals, the second
 * invisible until the first finished animating. ADR-0099's fallout patch then added a **second**
 * Escape rung inside the drawer and did not ask, which is worse: the editor's own "Discard unsaved
 * changes?" and the Notes tab's "Delete note" both render **inside** the portalled subtree, so
 * Escape aimed at either would have called `requestClose()` on the whole editor.
 *
 * Two copies of one rule is the drift this repository keeps recording, so it is one function.
 *
 * **Deliberately a DOM query rather than state.** Nothing tracks which modals are open — `Dialog`
 * and `Sheet` are independent components with no registry between them, and a rung asking "is a
 * modal up?" wants the truth at the instant of the press, not a value some provider is maintaining.
 * The `[open]` attribute is what `showModal()` sets and what `close()` removes, so it is the same
 * fact the browser is acting on.
 */
export function aNativeModalIsOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

/**
 * The **drawer's Escape rung** — an inner rung of ADR-0080's ladder, exported so it is one function
 * rather than an inline prop a test has to reproduce.
 *
 * It exists because a modal got Escape from the platform and a drawer does not: a `<dialog>`'s
 * `cancel` fires wherever focus is, while the shell's own rung deliberately defers to text entry
 * (ADR-0079), so with the caret in a field Escape did nothing at all and there was no keyboard way
 * out of the editor.
 *
 * The order of the three guards is the whole content:
 *
 * 1. `defaultPrevented` — anything inner that already answered keeps its press.
 * 2. {@link aNativeModalIsOpen} — a nested confirmation answers for itself. Without this, Escape
 *    aimed at "Discard unsaved changes?" or "Delete note" would also close the editor underneath,
 *    because both render inside the portalled subtree and their keydown bubbles through it.
 * 3. `preventDefault()` **then** act — which is what makes this a rung and not a competitor: the
 *    shell's outer rung sees the press was answered and leaves the drawer open, so one press cannot
 *    both close the editor and collapse the panel behind it.
 */
export function handleDrawerEscape(
  event: Pick<React.KeyboardEvent, 'key' | 'defaultPrevented' | 'preventDefault'>,
  requestClose: () => void,
): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (aNativeModalIsOpen()) return;
  event.preventDefault();
  requestClose();
}
