# ADR-0204: A shaded control says why, to every input

- **Status:** Accepted — 2026-10-21. The spec was approved by the product owner on 2026-10-21 with every default
  (CQ-1: a menu prints the reason as inline text, not a tooltip; CQ-2: menus **and** the labelled toolbar controls).
- **Spec:** [`docs/specs/shaded-reason-visible/feature-spec.md`](../specs/shaded-reason-visible/feature-spec.md) · **Plan:**
  [`implementation-plan.md`](../specs/shaded-reason-visible/implementation-plan.md)
- **Date:** 2026-10-21
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0082 §2 and its 2026-10-16 Amendment's "the reason is `sr-only` by design" bullet.
- **Extends:** ADR-0117's `purpose` vocabulary with one value.
- **Builds on:** ADR-0028 (the pen), ADR-0083 (shaded form fields already print their reason), ADR-0088 D1 (no flag),
  ADR-0111 (a shared primitive's keyboard contract is reviewed), ADR-0179, ADR-0183.

## Context

`docs/TECH_DEBT.md` #116 item 3: a shaded row-menu item's reason reached assistive technology only. `MenuItem`
rendered it in an `sr-only` sibling referenced by `aria-describedby`, so a sighted mouse or touch reader saw a
muted "Edit" and nothing else, while the canvas's plural selection bar printed the same kind of sentence as
visible text. ADR-0082's own premise is that one operation should not teach two mental models. The item was
deferred because there was no Tooltip primitive; ADR-0117 supplied one, and the product owner has decided the
reason becomes visible.

The survey in the spec found the same gap on every shaded **labelled** control that carries a reason: the menu
items, the (dark) `Combobox` option, `ToolbarButton`, `ToolbarPopover`, both halves of `ToolbarSplitButton`, the
status bar's Recalculate, and the selection bar's Isolate. On a toolbar the visible channel was a native `title`,
which is hover-only: no mainstream browser shows it on keyboard focus and a finger has no hover.

## Decision

### D1 — A shaded labelled control's reason is visible to every input

A mouse, a keyboard and a finger can each read why a control is shut, without the announcement a screen reader
gets changing: the name is unchanged, the description is the same sentence, and it is announced once.

### D2 — In a list (a menu, a listbox) the reason is inline text inside the item

It sits under the label as `text-muted-foreground text-xs`, is `aria-hidden`, and is still referenced by the item's
`aria-describedby`. Name-from-content skips a hidden child, while a **directly referenced** hidden node still
yields the description (accname 1.2, step 2A), so the name stays the label. This retires the `sr-only` sibling
`MenuItem` used, which was a non-permitted child of `role="menu"`. The reason (not the panel) carries `max-w-72`,
so a sentence wraps instead of widening the menu while every other menu keeps the width its labels give it. Every shaded item prints its own reason, even where several share one sentence:
a reason the reader has to look elsewhere for is the defect.

### D3 — On a toolbar the reason is a tooltip with a new purpose, `'reason-echo'`

`useTooltip` gains `purpose: 'reason-echo'`: the panel is `aria-hidden` and nothing is linked, exactly as
`'name-echo'`. It is a third value rather than a reuse of `'name-echo'` so the call site states which case it is
in (ADR-0117's rule), and it is not `'description'` because that links the tip while it is open, and focus opens
the tip in the same tick a screen reader announces the control, which would read the sentence twice beside the
permanent `sr-only` description.

`'reason-echo'` also opens on a click of the trigger (no separate option, so it can never be set on a live
control). A shaded control's press does
nothing, so showing why is the answer to it, not the "tap that does both" noise ADR-0117's touch rule exists to
prevent. It reaches a finger and a keyboard Enter or Space; a released long-press is still swallowed first, and
Escape still closes the tip without being withheld from the application. The tip closes when the control
stops being shaded, so a stale tip cannot reappear on a control the reader has left.

The tip is opened by hover (400 ms), by focus (immediately) and by a press on the shaded control. The native
`title` is withdrawn from a shaded labelled control that has a reason; a live control keeps the `title` it had.

### D4 — The `sr-only` assistive-technology channel is unchanged

Where a control already carried its reason in an `sr-only` description, that stays, and the visible carrier is an
addition. Selection-bar Isolate, which had only a `title` (which reached AT as the description because `aria-label`
pins the name), gains the `sr-only` span so removing the `title` loses nothing.

### Not in scope

- Icon-only and `'roomy'` toolbar controls already show `label — reason` through `useTooltip`; unchanged.
- `*Field` gates, `RadioCardGroup` and `BulkSelectionBar` already print the reason; unchanged.
- The Gantt read-only cell's `title` was left out here as "a tip on every cell the arrow keys cross is noise";
  that was resolved on 2026-10-22 (Amendment below).

## Amendment, 2026-10-22 — a tip that opens on request (`docs/TECH_DEBT.md` #538)

The product owner's decision of 2026-10-21 was "show on press". Building it corrected the premise of the
exclusion above: arrow keys do not cross cells. The grid's roving focus is per **row**, and a cell is
`tabIndex={-1}` with no cell cursor; what focuses a cell is a **click**, which also selects its row. The default
`'reason-echo'`, which opens on focus and on every click, would therefore have popped a tip on every row
selection made without the pen.

`useTooltip` gains `opensOn?: 'focus' | 'request'` (default `'focus'`, so every other caller is unchanged) and
returns `show()`. Under `'request'` a `'reason-echo'` tip opens on hover (400 ms) and when the caller asks, never
on focus, a click or a touch long-press (that path is off, so no click is swallowed), and the next `keydown`
anywhere closes it, closing only: the key still does its work. The Gantt's shut cell uses it. The refused edit
gestures ask: a double-click or double-tap, and F2 on a row whose editable cells are all shut, which shows the
first shut cell's tip and says its reason once in the polite live region. A single click, Enter, Space and the
arrow keys are unchanged and show nothing; typing is unbound. The native `title` is withdrawn from the cell for
D3's reason, and the `sr-only` description (D4) is unchanged. Spec: `docs/specs/gantt-cell-reason-on-press/`.

The tip also closes on a scroll (it is `position: fixed`) and ignores a lone modifier key as the "next key".
Only a shut cell with a reason runs the hook, in a child component, so writable cells carry no tooltip machinery.

**Known gap, accepted.** F2 shows only the first shut cell's tip, and only when no cell in the row is writable.
A shut cell beside a writable one has no keyboard route to the visible tip; a screen-reader user still has its
`sr-only` description, and a mouse or finger has hover and double-click. A cell cursor would close it and is a
separate decision. F2's announcement goes through `drag.announce`, the one live region the workspace shares;
`gantt-editing-implies-drag.structural.test.ts` pins that every host passing `editing` passes `drag`.

## Alternatives considered

- **A tooltip on menu items.** Needs a gesture on touch, pops on every arrow stop, and a tip over a portalled menu
  competes with it. Rejected as the default (CQ-1).
- **Inline text on the toolbar.** Breaks the deck's row budget (ADR-0109, ADR-0185).
- **One shared reason row in the menu.** ADR-0082 already rejected it: per-item reasons differ.
- **Fold the reason into the name.** ADR-0082 rejected it: the name would narrate state.
- **`purpose: 'name-echo'` for the toolbar tip.** Mechanically identical, but its name would lie.

## Consequences

- A menu with several shaded items repeats the reason (up to five in the activities row menu), and each item is
  taller, so a menu scrolls sooner at the 1024 x 600 design floor (ADR-0179). Accepted.
- Pressing a shaded toolbar control now shows a tip. A tip opened by a mouse press is placed off the trigger by the
  existing placement rule, so it does not swallow the mouse-up.
- No keyboard contract changes: the roving focus, Home/End, Escape and typeahead-free behaviour of `Menu` and the
  keys of the toolbar are as before (ADR-0111). Which key opens the tip is Enter or Space, which already activated
  the control.
- `ComboboxOption.disabledReason` follows the same treatment but ships dark (no production caller); the first
  caller owes the journey (ADR-0081 §1).
- Contrast of muted `text-xs` on the popover surface is an accessibility-review measurement, not asserted here.

## References

- `docs/TECH_DEBT.md` #116 item 3 (closed by this ADR) and #538.
- ADR-0082 §2, ADR-0117, ADR-0083 D4, ADR-0028.
