# ADR-0218: A click on the diagram gives it the keyboard

- **Status:** Accepted — 2026-11-12. The product owner approved the spec and the plan on 2026-11-12 with all four
  defaults. D1 and D2 ship with M1; D3 (M2) and D5 (M4) are added as dated amendments (D4, the double-click, follows with M3) to this file.
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

### D3 — Delete and Backspace on the list ask the Delete button's question (added 2026-11-12, M2)

Delete and Backspace pressed while the diagram's **list** has focus open the same confirmation the selection bar's Delete
button opens: the host's single confirmation for one selected activity, the plural "Delete N activities?" for two or more.
Each goes through the button's own path, so the dialog, the focus return and the one-step Undo are the button's.

- **Always ask**, never delete on the key (the product owner, Q2). Undo restores afterwards.
- **On the list, not the root**, for Ctrl+A's reason: the handler runs only when the list has focus, so a Backspace typed
  into the search box or any field is structurally that field's, with no `closest('input')` test to keep in step. A press
  with Ctrl, Meta, Alt or Shift is not ours. The key is claimed (`preventDefault`) so Backspace never navigates back.
- **Refused aloud, never silently.** One selected: `deleteRefusal`, exported from the selection bar's module and built from
  the very `penGated` + `penRefusal` the shaded button uses, so key and button cannot disagree (no pen, role, read-only,
  Late-start overlay) and say the same sentence. Plural: the bar's `bulk.gate.reason`. Nothing selected: "Nothing is selected
  to delete."
- **An armed tool does not matter**: the bar and its Delete button stay on screen in the Link, LOE and Marquee tools, so the
  key behaves as the button does. A held key repeats into the modal, not the plan.
- **Not in the Gantt, not in the activities table** (spec D-c, D-d: a Gantt cell already uses its own keys; the table has
  row menus). A host that wired no bulk operations has no plural bar, so two selected and the key do nothing, as the
  button's absence does.
- **No `aria-keyshortcuts` on the buttons.** The key acts only with the list focused; advertising it on a button a reader
  is standing on would promise a press that does nothing there. The shortcuts sheet lists it ("Delete / Backspace").

### D5 — A press on a bar carries its select modifier (added 2026-11-12, M4)

A press on a bar runs the gesture machine whenever the pen is held, and whenever Ctrl or Cmd is held (the marquee chord
arms it for every reader, and a reposition handler is always wired), so the bar becomes `repositioning`, or `resizing` on
an edge. Its unmoved release returned `select` and nothing else, and the canvas called `onSelect(id)`, a **replace**. The
plain click path, which has the modifier, never ran. Measured in Chromium (M0): Ctrl-click replaced with the pen **and
without it**; Shift-click was lost only with the pen.

- The machine's `Modifiers` gain `shift`; `repositioning` and `resizing` capture `selectModifier` (`toggle` for Ctrl/Cmd,
  `span` for Shift, Ctrl winning) **at press**, never at release, as `marqueeing` captures `additive`; the unmoved
  release returns it beside `select`, and the canvas calls `onSelect(id, modifier)`.
- A plain press adds no key, so a plain click stays the one-argument call it was. Shift still never arms the marquee, and a
  press that becomes a move selects nothing, as before. The Link and Add tools, the marquee and touch run no new path.
- Corrects the spec's P4 and `docs/HANDOFF.md`'s "worked at 8.4": the fault is wider than "with the pen".

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
- **A screen reader hears the list and the clicked activity on a mouse press, once.** ADR-0026 §7 makes the list the
  canvas's account of itself and says keyboard and visual focus never diverge, so the list's own focus announcement
  (the active option and its description) is the account of a click. The panel therefore does **not** also push the
  row's text through the polite live region for a press that is about to move focus; it keeps that announcement where
  no focus move follows (the Add tool, an open create popover, focus held by a field or a dialog, the list already
  focused), and the selection **count** for a Ctrl/Shift-click is still announced, because the focus announcement does
  not carry it. A sighted mouse user sees nothing, because the list is `sr-only`. **Not verified with a real screen
  reader**: the one-telling claim rests on the unit test (one announcement path per press) and the accessibility
  review's reading of the list's markup, not on NVDA, JAWS or VoiceOver.
- **After a click on empty ground the focus rests on the clipped list with nothing selected, so no focus indicator is
  drawn until the next key (accepted).** The accessibility review (S2) recorded it and asked
  for no cue: the next arrow key selects a row and draws the ring on the bar, and Tab from the list lands on a visible
  control, so the state ends at the reader's next keystroke.
- **A create popover, a menu or any dialog stands the fallback down.** The popover is a plain `<form>`, not a
  `<dialog>`, so a press on its padding left focus on `<main>` and made Ctrl+Z, Ctrl+V and `?` act beneath it; the
  document fallback now also stands down while `[role=dialog]`, `[role=alertdialog]`, `[role=menu]` or an element
  marked `data-key-scope-block` (the popover) is in the document (accessibility review S3).
- Copy/paste and `?` now work from `<body>` and `<main>`, which they never did.
- The shortcuts sheet gains no row: the keys are not new.
- The Gantt gets only D2: its bar press does not move focus, so the keys work there while focus is on the toolbar and, with
  D2, also when it is on `<main>` or `<body>`.
- **Not verified:** Firefox and WebKit (not installed where this was built) and real devices. The journeys run on
  Chromium like the rest of the estate.
