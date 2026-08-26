# Feature Spec: The stable foot row

- **Status:** Draft — awaiting product-owner approval
- **Date:** 2026-08-26
- **Measurement:** [`m0-measurement.md`](m0-measurement.md) — every figure below is from that run
- **Related:** ADR-0060 (per-scope save), ADR-0064 (tool-mode contract), ADR-0092 (canvas dock),
  ADR-0093 (an object action belongs on the object), ADR-0110 (facts registry), ADR-0112 (the
  header row), ADR-0113 (measure the problem)

## 1. Business understanding

### Problem

Two problems, one of which nobody had reported.

**The reported one.** The plan facts and the object-action bar **swap sides** when the activities
panel expands. Collapsed, the facts sit left and the actions right on one shared row; expanded, the
actions move into the panel's handle row and the facts drop to a full-width strip at the very
bottom. The product owner's words: _"I don't think it needs to jump between where it is and then
full screen width when the pullout is expanded."_

**The one measurement found.** The row **clips**. Its content is **1753 px at every width** — it
neither wraps nor scrolls — against containers of **1619 px at 1920** and **1345 px at 1646**. So
`Clear visual placement` is off-screen on a 1920 display and `Edit`, `Duplicate`, `Delete` join it
at 1646. Keyboard still reaches them, because a browser scrolls a focused element into view, which
is why this has gone unreported since it shipped.

### Users

Planners and Contributors working a plan on the TSLD or Gantt surface. The clipping affects anyone
using a pointer; the redesign affects everyone.

### Primary use cases

1. Select an activity and act on it without hunting for the control.
2. Read the plan's facts — activity count, data date, finish, critical count — without them moving.
3. Expand the activities table and back, with the chrome staying put.

### Expected outcomes

- No control is ever off-screen at any supported width.
- The facts and the actions each have exactly one home, in both panel states.
- The command surface reads as one system: the object bar matches the deck's card styling.

### Success criteria

- Measured: row content ≤ container at 1920 and at 1646, with a selection.
- Measured: expanding the panel moves no chrome and changes no band height (ADR-0092's 0 px rule).
- A journey proves every action is pointer-reachable at both widths.

### Open questions

**OQ-1 — the other dock strips are unmeasured.** M0 measured the armed-tool statement (410 px
intrinsic) and nothing else. ADR-0092 docks four more — the link confirmation, the conflict banner,
the empty-plan notice, the plural selection bar. The design below frees the armed statement's space
by hiding it, but the remaining strips still need somewhere to go, and the slack after streamlining
is **100 px at 1920 / 52 px at 1646**. **M1-T1 measures them before anything is built.** If a link
confirmation does not fit, the strip set needs its own answer and this spec is amended.

## 2. Functional requirements

### User stories & acceptance criteria

**US-1 — nothing is off-screen.** As a planner at 1646, every action on a selected activity is
reachable with the pointer. _Given_ an activity is selected, _when_ the foot row renders at any
width from 1280 to 1920, _then_ no control's right edge lies beyond the row's.

**US-2 — the chrome does not move.** _Given_ the panel is collapsed, _when_ it expands, _then_ the
facts and the object actions stay in the same row, in the same order, at the same height.

**US-3 — the pen still names a person.** _Given_ someone else holds the pen, _when_ the planner
looks at the header, _then_ the pill reads `Locked · Alexandra` and its accessible description is
the full sentence.

**US-4 — arming a tool still announces.** _Given_ a screen-reader user arms or disarms a tool,
_when_ the mode changes, _then_ it is announced, even though the statement is no longer painted.

### Permissions

Unchanged. `Progress` stays role-gated (a Contributor may use it while a Planner holds the pen);
the four folded doors stay pen-gated. **Selecting is a read** (ADR-0063 M4b) — the bar renders for a
Viewer with its write actions shaded and a reason attached (ADR-0082).

### Edge cases

- Plural selection: the bar is the plural one; the fold rule applies identically.
- Gantt view: the same bar, per ADR-0095. Both widths must be measured there too.
- No selection: the row carries the facts and the panel affordance only — 607 px today, 481 after.
- A tool armed _and_ an activity selected: the state OQ-1 is about.

## 3. Technical analysis

`apps/web` only. The CPM engine is not imported, no API or schema change, so the ADR-0034
recalculation parity gate is untouched by construction.

The machinery mostly exists. ADR-0110 D1 already made the plan facts a **registry** — an outlet plus
an in-place fallback — precisely so they can be hosted in one place or another without a branch.
Pinning them under the pullup in both states is a change to where the outlet is declared, not new
plumbing.

### Dependencies

None added.

## 4. Solution design

### D1 — One foot row, last band on screen, identical in both panel states

`[ object actions … ] [ ‹dock› ] [ facts ] [ New activity ] [ ⌃ ]`

The panel expands **above** it. Nothing moves between states; the panel's handle row and the
bottom status strip merge into this one row.

### D2 — The armed-tool statement is hidden, and its live region is kept

The strip **duplicates the trigger**. `tsld-toolbar-items.tsx:622-628` swaps the Add trigger's label
to `Adding Task` / `Pick start driver` / `Pick finish driver` and sets `pressed={armed}`; `:809-820`
does the same for Link (`Linking · FS`). So the mode is already stated where the planner armed it,
and ADR-0064's founding defect — a planner who believes a tool is armed and is wrong — is answered
by the trigger, not by the strip.

What the strip uniquely carries is the **instruction**, the **`Esc to stop`** affordance, and the
**announcement**. The element therefore stays in the DOM as `sr-only`, so ADR-0064 §7's WCAG 4.1.3
fix survives; `Esc to stop` moves to the armed trigger's title. **Deleting the element outright is
rejected**: it would make arming silent to a screen-reader user.

This frees the dock's 410 px requirement, which is what makes D4 possible without a `Focus ▾`.

### D3 — The pen sentence leaves the foot for the header pill

`Locked · Alexandra` at roughly 60–80 px, with the full sentence as the pill's accessible
description. The badge alone has four words — Editing / Locked / Read-only / Available — and the
**name** is the only payload the sentence adds; carrying the whole sentence in the header was
measured at up to **432 px** and does not fit (ADR-0112 D3, which is why it moved out).

### D4 — The editor doors fold at narrow widths only

Five buttons at 1920; `Logic`, `Resources`, `Steps` and `Edit` fold into one `Edit ▾` below a
measured threshold. `Progress` never folds — it is role-gated, not pen-gated, and folding it into a
pen-gated trigger would shade a Contributor's only available action (ADR-0060).

**This is the product owner's decision, taken against a recorded concern**, and the concern is
written here rather than dropped: a control that is a button on one machine and a menu item on
another is the responsive-position shape ADR-0091 M7 records shipping a defect from. Three
mitigations are therefore part of the design rather than follow-ups —

1. the threshold is **derived from the measured content width**, never a hand-tuned breakpoint;
2. the fit gate asserts pointer reachability in **both** states, not just the wide one;
3. the accessible name of each command is identical in both states, so a keyboard or AT user's
   route does not change with the window.

### D5 — Relabels

`Zoom to selection` → `Zoom selection` (−16), `Report progress` → `Progress` (−46),
`Clear visual placement` → `Clear placement` (~−46, derived), `Isolate logic path` already renders
as `Isolate`. The long form moves to `description` so WCAG 2.5.3 (Label in Name) still holds — the
ADR-0091 M7 pattern.

### D6 — Card styling, no caption

The bar takes the deck's card, button geometry and icon treatment, and **no group caption**: a
caption in the deck is a focusable disclosure button holding a roving tab stop, which on a
single-purpose bar buys nothing and costs width.

### The arithmetic

|                        | px                              |
| ---------------------- | ------------------------------- |
| Today's content        | **1753**                        |
| − pen sentence (D3)    | −126                            |
| − three relabels (D5)  | −108                            |
| **After streamlining** | **1519**                        |
| Container at 1920      | 1619 → **fits, 100 spare**      |
| Container at 1646      | 1345 → over by 174              |
| − fold four doors (D4) | −226                            |
| **Folded**             | **1293** → **52 spare at 1646** |

### Alternatives rejected

- **`Focus ▾` folding Zoom + Isolate** — needed only while the armed statement occupied the dock.
  D2 removes that requirement.
- **Two permanent foot bands** — costs ~25 px of chrome in the collapsed state, which is the
  opposite of the brief.
- **Deleting the tool statement's element** — a WCAG 4.1.3 regression (see D2).
- **Moving the Author card to the foot** — measured: `View + Find + Plan` need ~1990 against an 1878
  container, **~112 px over**, so the deck does not collapse to one row even with Author gone. Held
  behind a consolidation pass; the prize is ~50 px (the deck is 108 px for two rows).

## 5. Links

- [`m0-measurement.md`](m0-measurement.md)
- `apps/web/measure-toolbar/m0-foot-row.spec.ts`
