# ADR-0218: A click on the diagram gives it the keyboard

- **Status:** Accepted — 2026-11-12. The product owner approved the spec and the plan on 2026-11-12 with all four
  defaults. D1 and D2 ship with M1; D3 to D5 are added by M2 to M4 as dated amendments to this file.
- **Date:** 2026-11-12
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0048](0048-undo-redo-command-stack.md) M5 (the undo accelerators' body-only document fallback is
  replaced by one fallback owned by the workspace key scope).
- **Extends:** [ADR-0026](0026-tsld-canvas-rendering-and-architecture.md) §7 (the list is the canvas's accessible twin;
  keyboard and visual focus never diverge).
- **Spec:** [`docs/specs/diagram-keys-and-selection/`](../specs/diagram-keys-and-selection/feature-spec.md) §4.7 and §4.9 ·
  **Plan:** [`implementation-plan.md`](../specs/diagram-keys-and-selection/implementation-plan.md) (M1) · **Measurement:**
  [`m0-verification.md`](../specs/diagram-keys-and-selection/m0-verification.md)
- **Builds on:** ADR-0064 (the Escape ladder), ADR-0079 §4 (an Escape typed into a text field belongs to the field),
  ADR-0108 (a modal guards the canvas), ADR-0111 (a primitive's keyboard contract is reviewed before release),
  ADR-0135 (a container hands focus back), ADR-0177 (a finger drags what it has selected), ADR-0088 D1 (no flag).

## Context

After a mouse press on the diagram, Ctrl+Z, Ctrl+C, Ctrl+V and Escape do nothing, and the arrow keys do not move the
cursor. The GUI review found it at steps 3.3 and 3.14, and `docs/HANDOFF.md` recorded half of it as "Esc never clears a
selection, by design". It was never a design.

The cause is one fact about focus. The workspace's `?`, undo/redo and copy/paste bindings are a React `onKeyDown` on the
workspace root, which hears only keys pressed while focus is inside it. The scene canvas is `aria-hidden` and takes no
focus, so a press on it moves focus to its nearest focusable ancestor, the shell's `<main tabIndex={-1}>`, which
**contains** the root: no key pressed there passes through the handler. Undo had a document fallback that acted only when
`<body>` had focus, so it stood down for `<main>`; copy/paste had none. Escape and the arrows belong to the list, which a
click never focused. Measured in Chromium (`m0-verification.md`): after a click, a drag and a press on empty foot-row space
`document.activeElement` is `main#main`; Ctrl+Z left the bar's version unchanged, Ctrl+C then Ctrl+V left three
activities, and Escape left the selection.

No journey pressed a key after a pointer press: the undo and copy/paste suites select through the list, a keyboard path,
which is why every suite was green.

## Decision

### D1 — A finished press on the diagram focuses its list

When a press on the scene canvas ends, in Select, Marquee, Link or LOE, whatever it did (a click, a move, a pan, a marquee
sweep, a link pick), keyboard focus moves to the diagram's hidden listbox, with `focus({ preventScroll: true })`.

- **On release, not on press.** The browser's own focus move to `<main>` is the default action of `mousedown`, after
  `pointerdown`; a `focus()` in `pointerdown` is undone a moment later.
- **From the release and again from the `click`.** On touch the browser sends its compatibility `mousedown` **after**
  `pointerup`, and that moves focus back to `<main>`: a focus made on `pointerup` did not stick for a tap (measured);
  one made on `click` did, for a mouse, a drag, a pan and a tap. The second call is a no-op when the list already has focus.
- **Without the list's row-0 default.** The list's `onFocus` selects its first row when nothing is selected. That is right
  for a keyboard user tabbing in and wrong here: with nothing selected, an empty-ground click followed by the focus move
  left the first row selected (measured). A one-shot flag, set only for the duration of the synchronous `focus()` call,
  suppresses it, in the manner of the Next-conflict flag. An empty-ground click never selects the first row.
- **Never taken from something that owns the keyboard.** Not in the Add tool, where the release opens the create popover
  whose Name field must keep focus, and not while that popover is open; not when focus is in a text field, a dialog, a menu
  or a form. A canvas press normally leaves none of those focused (the `mousedown` blurs it), so this is a guard on a case
  that should not occur, not a rule that fires.
- **Touch is not excluded.** The list is not a text input, so no on-screen keyboard rises, and a Surface with its keyboard
  cover attached gets the keys after a tap. The gesture rules of ADR-0177 are untouched: nothing here changes what a press
  does, only where focus rests afterwards.

### D2 — The workspace key scope owns one document fallback

`usePlanWorkspaceKeyScope` installs the single document `keydown` listener for the whole scope (`?`, undo/redo, copy/paste),
acting when focus is on nothing, on `<body>`, or on an element that **contains the workspace root**, and no `<dialog>` is
open. It runs the same composed handler, so the guards (`modalOpen`, text-entry targets, the pen, a live text selection for
copy) are the same in both places. The undo hook's own body-only listener is removed.

The rule cannot double-fire with the React handler: an element cannot both contain the root and sit inside it, so "focus
above the root" and "focus inside the root's DOM" are disjoint, and focus on a portalled toolbar control is in the React
tree but is not an ancestor, so only the React handler has it. This covers a press on non-focusable chrome (the ruler, the
foot row, the Gantt, where a bar press does not move focus at all) that D1 does not reach.

## Alternatives considered

- **Make `<main>`, or a new wrapper, the key scope.** `<main>` is the shell's and plan-unaware (ADR-0029); a focusable
  wrapper adds a meaningless tab stop, the reason the root is not focusable. Escape and the arrows would still be dead.
- **The fallback alone (widen it to `<main>`).** Fixes Ctrl+Z/C/V, not Escape, the arrows or Enter, and leaves the owner's
  expectation ("what I clicked is what the keyboard acts on") half met. Kept as D2, as the safety net for chrome presses.
- **Focus on `pointerdown`.** Undone by the `mousedown` default action.
- **Make the canvas focusable.** It is `aria-hidden`; the list is its accessible twin (ADR-0026 §7).
- **A global `window` keydown for everything.** Cannot keep "not while typing" structurally, the reason the scope is a
  React handler.
- **A flag.** ADR-0088 D1: the rollback is the commit.

## Consequences

- **Escape clears a selection after a click**, as the ADR-0064 ladder always said it should. The owner is told (spec Q1).
- **A screen reader hears the list and the clicked activity on a mouse press.** ADR-0026 §7 makes the list the canvas's
  account of itself and says keyboard and visual focus never diverge, so announcing what was clicked is the right
  behaviour; a sighted mouse user sees nothing, because the list is `sr-only`. A screen-reader user who clicks gets the
  keys without hunting for the list. Reviewed under ADR-0111 before release.
- Copy/paste and `?` now work from `<body>` and `<main>`, which they never did.
- The shortcuts sheet gains no row: the keys are not new.
- The Gantt gets only D2: its bar press does not move focus, so the keys work there while focus is on the toolbar and, with
  D2, also when it is on `<main>` or `<body>`.
- **Not verified:** Firefox and WebKit (not installed where this was built) and real devices. The journeys run on
  Chromium like the rest of the estate.
