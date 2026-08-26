# Feature Spec: The stable foot row

- **Status:** Draft — **rewritten 2026-08-26 after four blocking specialist reviews**
- **Measurement:** [`m0-measurement.md`](m0-measurement.md) — every figure below is from that run
- **Related:** ADR-0060, ADR-0064, ADR-0080, ADR-0082, ADR-0090, ADR-0092, ADR-0093, **ADR-0109**,
  ADR-0110, ADR-0112, ADR-0113

> **What changed in this rewrite, and why the first draft was wrong.**
>
> The first draft diagnosed a **width-budget** problem and derived four decisions from a ladder of
> px arithmetic. The architecture review proposed — explicitly as unverified — that the row clips
> because one wrapper is `shrink-0`, not because it is too wide. **Probed, and it is right**
> (§C1b). That collapses the ladder: a row that wraps has no fit/no-fit verdict, and the figures the
> old D3/D4/D5 rested on describe a state the product will not be in.
>
> Three further claims of mine were **false against the code** and are corrected below rather than
> quietly dropped: `CanvasModeBand` is not a live region; the pen sentence IS the only announcer of
> pen transitions; and 1753 px is the row's narrowest state, not its widest.

## 1. Business understanding

### Problem

**P1 — the row clips, and it is a one-line cause.** Content is 1753 px at every width against
containers of 1619 (1920) and 1345 (1646). `Clear visual placement` is off-screen on a 1920 display;
`Edit`, `Duplicate` and `Delete` join it at 1646. The cause is `selection-actions.tsx:845` —
`className="flex shrink-0 items-center"` — sitting between two containers that both wrap
(`Toolbar.tsx:181-189`, `canvas-dock.tsx:104`). A `shrink-0` item takes `max-content`, so the
wrapping toolbar inside is never asked to break a line.

**P2 — the chrome juggles.** The facts and the object actions swap sides when the activities panel
expands. Reported by the product owner.

**P3 — the wrapped row is tall.** Dropping the class costs height: **41 → 77 px at 1920** (two
lines) and **41 → 117 px at 1646** (three). That is what the streamlining is now for.

### Success criteria

- No control is off-screen at any width from 1280 to 1920, in either panel state, on TSLD and Gantt.
- Expanding the panel moves no chrome.
- The wrapped row is **one line at 1920 and at most two at 1646** in the common states.

## 2. Functional requirements

**US-1** every action on a selected activity is pointer-reachable at every supported width.
**US-2** expanding the panel moves neither the facts nor the actions.
**US-3** pen transitions are still announced, and still name a person.
**US-4** arming a tool still announces, and the link confirmation's Undo stays operable.

### Permissions

Unchanged. `Progress` is role-gated; the editor doors are pen-gated. Selecting is a read
(ADR-0063 M4b) — a Viewer sees the bar with write actions shaded and a reason (ADR-0082).

### Edge cases

- **Below `md` the activities bar is not mounted at all**; the dock renders in place and the facts
  render in the shell status bar. US-2 is a **stated exception** there, not a claim.
- Gantt's bar is ~255 px narrower (`zoom-to-selection` and `isolate-logic` are
  `isVisible: ctx.canvas !== null`).
- A summary selection adds `Dissolve` and `Duplicate band`; a flagged one adds the conflict remedy.

## 3. Technical analysis

`apps/web` only. The CPM engine is not imported; no API or schema change.

## 4. Solution design

### D1 — The row wraps. One line, and it is the whole correctness fix.

Drop `shrink-0` from `selection-actions.tsx:845`. Measured: overflow gone at both widths. **This
ships alone, first, as one revertible commit**, verified against a gate that is red before it.

This is ADR-0109 D1's rule — _a command surface wraps; it never hides_ — applied to the one command
surface that was left out of it.

### D2 — One foot row, facts LEADING

`[ facts ] [ ‹dock — object actions, transient strips› ] [ New activity ] [ ⌃ ]`

The panel expands above it. **Facts lead**, reversing the first draft: `activity-bottom-panel.tsx:177-184`
puts them first with a stated reason, and a transient region placed before an always-present one
makes the facts move horizontally every time a selection appears — the juggle this epic exists to
remove, reintroduced one axis over.

No new registry. `PlanSlotHost` and `CanvasDock` already exist and are the same self-registering,
clear-by-identity mechanism; the change is that **one host mounts both outlets in both panel
states**, instead of the collapsed bar mounting both and the expanded header mounting only the dock.
`docs/TECH_DEBT.md` #200's consolidation (fold `canvas-dock` into `PlanSlotName`) is **noted and
declined for this epic** — it is a refactor of a third consumer, and mixing it in would make the
correctness commit unrevertible on its own.

### D3 — The mode statements are decided PER KIND, at the point they are built

The first draft said "hide the element, keep it `sr-only`, because that preserves the WCAG 4.1.3
announcement". **Both halves were false.** `CanvasModeBand.tsx:112-114`: _"No `role` is passed, so
this is NOT a live region."_ The announcement is `TsldPanel.tsx:812-837`. So `sr-only` preserves
nothing and costs a phantom line in the reading order — read only if an AT user navigates onto it,
repeating what they already heard.

There are **six** kinds, not one:

| kind          | trigger restates it?                             | decision                            |
| ------------- | ------------------------------------------------ | ----------------------------------- |
| `adding`      | yes — label swaps to `Adding Task`               | **withdraw**                        |
| `loe`         | yes — `Pick start driver` / `Pick finish driver` | **withdraw**                        |
| `linking`     | partially — `Linking · FS` + pressed             | **withdraw**                        |
| `marquee`     | **no** — label stays `Select`, only `pressed`    | **keep**                            |
| `linkPicking` | **no** — byte-identical to `linking`             | **keep** (it names the predecessor) |
| `linked`      | **no** — and it renders an Undo `<Button>`       | **keep**                            |

`linkPicking` is the sharp one: it is the mid-pick state of the gesture ADR-0064 was opened on, and
the only place the two-rung Escape is stated. `linked` is the link confirmation ADR-0064 required —
`sr-only` would leave its Undo focusable at zero size (**SC 2.4.7**), the ADR-0090 defect
reintroduced.

The decision is made in `TsldPanel` where the statement is built, not by a class on the component.

**`Esc to stop` and the two shortcut clauses** (`or click for a day`, `Ctrl to add` — recorded in
`CanvasModeBand.tsx:57-62` as undocumented capabilities) move to the armed trigger as an
`aria-describedby`-linked `sr-only` sibling — **never `title`**, which `ToolbarButton.tsx:7-23` and
`ToolbarSplitButton.tsx:40-52` both record as "the house failure pattern this codebase has now been
caught by four times". They also go in the shortcuts sheet.

**Open hole to close in M2:** `Deck` folding unmounts a group's items and the fold set is persisted
globally in `localStorage`. A planner who has folded `Author` has no trigger rendered, so a withdrawn
statement is stated nowhere. The rule: **a withdrawn statement returns whenever its trigger is not
rendered.**

### D4 — The pen keeps a live region; the pill gains the name

`CompactPenStatus.tsx:137-165` is the **only** announcer of pen transitions in `features/plan-lock`.
A description on a roleless `<span>` announces on nothing — pen transitions happen _to_ a reader
without any gesture, which is ADR-0028's whole point. So the live region **stays**; only its visual
weight changes.

The pill gains the name where a name exists. It is **never appended to `Editing`** — that tone means
_you_ hold it, and the name in scope would be a _requester's_.

`Locked · Alexandra` alone collapses four states that differ in what you can do next
(`canOverride` / `canTakeOver` / `waitingForHandover` / `expired`), and `lost` has **no name at all**.
So the compact form is a **summary beside** the live region, not a replacement for it.

### D5 — Relabels: one taken, three declined

| proposed                                     | verdict                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Report progress` → `Progress`               | **declined** — `selection-actions.tsx:423-425` requires this vocabulary to match the activities table, and renaming here renames three surfaces and not that one |
| `Zoom to selection` → `Zoom selection`       | **declined** — `:721-726` records `Zoom to` shipping, failing WCAG 2.4.6 and being reverted. 16 px is not worth reopening it                                     |
| `Clear visual placement` → `Clear placement` | **amended to `Clear visual start`** — keeps the word separating Visual from Early mode and matches the `visualStart` field                                       |
| `Isolate logic path` → `Isolate`             | **already done** for the inactive state; the active state reads `Isolating · Driving path` and is untouched                                                      |

### D6 — Card styling: the class moves to `toolbar-styles.ts`, and the height is re-derived

`Deck.tsx:280`'s card is a bare literal appearing once. Copying it is the one-off styling this repo
forbids; it moves to `toolbar-styles.ts` beside `toolbarControlVariants`, imported by both.

**Its geometry must be re-derived**, not reused: border + `px-2 py-1.5` around `min-h-9` content is
~50 px against a 36 px row, and `dock.spec.ts:97,104` assert canvas height as an **equality**.
`selection-actions.tsx:841-844` records that box being measured and rejected. That comment is
**rewritten to say why the invariant no longer holds**, not deleted.

### D7 — The dock gets a precedence policy, not a width budget

The first draft's OQ-1 asked whether five strips fit in the leftover. They cannot, and measuring
would only prove it. `canvas-dock.tsx:87` already does this once — the plural selection bar replaces
the singular one at source. Generalised: **at most one transient strip plus at most one selection
bar**, decided in `TsldPanel`. Bounded by construction, testable as an invariant.

### D8 — The responsive fold is DROPPED (product-owner decision, 2026-08-26)

The first draft folded four editor doors into `Edit ▾` below a threshold. It was approved when it
was needed to make the row **fit**. D1 removes that need. What remains argues against it:

- it reintroduces the mechanism **ADR-0109 D1 deleted product-wide**, uncited in the first draft;
- `resolveLayoutMode` has **no production caller** — both `Deck` and `Toolbar` pass a literal — so
  the threshold needs new measurement machinery, in a primitive whose docblock says it no longer
  measures anything;
- `ToolbarSplitButton` gates **both halves as one command**, which is wrong for four differently
  gated ones (`ExportMenuControl`'s trigger + `Menu` is the right precedent);
- `Edit ▾` shares its label with its own child item;
- `Steps` is **omitted** today, not shaded, so a parity test must cover `isVisible` for all four.

**Dropped.** Put back to the product owner with the height it buys against those five costs, they
chose to drop it: five buttons at every width, and the row wraps instead. The accepted cost is one
extra line at 1646 in some states.

## 5. Declined suggestions, recorded

- **The IA critique** (ux): fold the four editor doors into the editor's own tabs and move the rarer
  actions behind a `⋯`, mirroring the activities table. It is probably right and it is a **different
  epic** — it changes what the bar is for, not how it fits. **Product-owner decision 2026-08-26:
  record it, do not act on it.** It goes in the ADR as a live question.
- **TECH_DEBT #200's registry consolidation** — see D2.
- **Citing SC 1.4.10 for the clipping** — wrong scope (not a zoom condition; toolbars are commonly
  exempt). **SC 2.4.11** is cited only if a real-browser screenshot shows focus does not fully
  reveal a clipped control; otherwise the defect is stated as pointer-operability without a number.
