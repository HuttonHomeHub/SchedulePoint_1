# ADR-0114 — A row that cannot shrink is never asked to wrap

- **Status:** Accepted
- **Date:** 2026-08-27
- **Supersedes:** nothing
- **Amends:** ADR-0092 (its 0 px rule becomes a bound; the dock hosts at most one strip, in a row
  that is the last band in **both** panel states), ADR-0064 (a mode statement is withheld where the
  armed trigger already says the same thing), ADR-0112 D1 (the pen's sentence keeps its live region
  but stops painting)
- **Spec:** [`docs/specs/foot-row/`](../specs/foot-row/)

## Context

The product owner sent four screenshots of `web-v0.108.0` — 1920 and 1646, panel collapsed and
expanded — and described the foot as **juggling**: the plan's facts and the object-action bar swapped
sides every time the activities panel opened, the status bar jumped between sitting under the pull-up
and running the full width of the screen, and the object bar "moves about" rather than staying
pinned. They also asked whether that bar should look like the deck's other toolbars, and whether some
Author commands could move down into it.

Measuring it first (M0, `apps/web/measure-toolbar/m0-foot-row.spec.ts`) found something nobody had
reported: **the bar was not merely moving, it was clipped.**

| viewport | content | container | over by | controls off-screen                                     |
| -------- | ------- | --------- | ------- | ------------------------------------------------------- |
| 1920     | 1753    | 1619      | **134** | `Clear visual placement`                                |
| 1646     | 1753    | 1345      | **408** | `Edit`, `Duplicate`, `Delete`, `Clear visual placement` |

The content width is **identical at both widths**: the row neither wrapped nor scrolled, it clipped.
So `Delete` was pointer-unreachable on the Surface Pro and one control was already off-screen on the
24″ monitor the product is designed for. It is the ADR-0090 defect, in a different surface, three
epics later.

**And the obvious explanation for why nobody had reported it is one this epic's own measurement
disproved.** The first draft of this record said the controls stayed keyboard-reachable "because a
browser scrolls a focused element into view". Reproduced in Chromium with `shrink-0` restored and
the clipped control focused, the rect is **identical before and after** — 2042 px at 1920, 1667 px
at 1646 — because the clip comes from an ancestor with `overflow-hidden` and there is no scrollable
ancestor to move (`m0-measurement.md` §C1d). A focused control was never brought fully into view.
SC 2.4.11 is nevertheless **not cited**: it triggers when the focused component is _entirely_
hidden, and part of the control's box stays inside the viewport. The defect is stated as
pointer-inoperability with a focused control never fully revealed, without a WCAG number. It went
unreported because nothing looked wrong — the row simply ended, and a control that is not there
looks the same as a control that does not exist.

**The cause is the title.** `Toolbar` wraps unconditionally (`Toolbar.tsx:181-189`) and the dock
outlet is `flex min-w-0 flex-1 flex-wrap` (`canvas-dock.tsx:104`) — but the object-action bar sat
between them carrying `shrink-0`. A `shrink-0` flex item takes `max-content` and never shrinks, so
the outlet's width was never imposed on it and the wrapping toolbar inside it was never asked to
break a line. The surplus painted past the row and the workspace body's `overflow-hidden` took it
silently. Both mechanisms were live; neither could reach the other. Nothing on screen looked wrong:
the row simply ended.

## Decisions

### D1 — The object-action bar wraps, and that is the whole correctness fix

`selection-actions.tsx` goes `shrink-0` → `min-w-0`. One word. Every control the pointer could not
reach becomes reachable at every measured width, and the row grows a line instead of losing a
button.

It ships **first, alone**, ahead of every layout decision below, because it is a live defect and the
rest is arrangement. The gate lands with it: `e2e-workspace-fit/command-surface.spec.ts` gains
_"every object action a pointer can see, it can also reach"_, sweeping the object bar with the same
`elementFromPoint` descent the command deck already uses — **verified red** against the shipped
`shrink-0`, naming all four controls at 1646.

**It costs ADR-0092 its equality, and that is stated rather than absorbed.** That decision's rule is
that a docked strip costs the canvas **0 px**, asserted in the dock journey as an equality — and it
held only because this bar could not wrap: the row stayed 36 px and the surplus was clipped. The
equality was being paid for by hiding controls. It becomes a **bound** (a selection may cost a line
or two, never a band), generous on purpose because the milestones after it reduce the row's content
and a tight bound would fail on the improvement.

Selecting the activity to sweep is itself a finding: the canvas's parallel listbox is `sr-only`
(ADR-0026 D7), so `getByRole('option').first().isVisible()` answers **false** and a probe written
that way records a skip rather than a failure. The gate focuses the listbox instead, which
default-selects.

### D2 — One foot row, rendered in both panel states, with the facts leading

`PlanActivitiesFootRow` is one component. Collapsed, it is the whole bar; expanded, the panel grows
**above** it and it stays the last band. The facts, the dock and the panel's own toggle keep their
positions across the transition, which is the juggle removed at its cause rather than tuned.

**The facts lead and the dock follows.** The spec's first draft had them the other way round, which
would have slid the facts sideways every time a selection appeared — the same juggle one axis over.
An always-present region goes before a transient one.

`min-h-9`, never `h-9`: since D1 the bar wraps, so a row of eleven object actions is routinely taller
than the band, and a fixed height would clip it again in a new place.

### D3 — A mode statement is withheld where the armed trigger already says it

ADR-0064 put the armed-tool statement in reserved chrome rather than over the scene, and that is
right. What it did not cost is that the statement is **410 px** of the widest transient strip the
dock ever holds, and that for `Add`, `Add milestone` and `Link` the armed trigger is lit two rows
away saying the same word.

So the statement is decided **per kind**, with the reason written at each branch:

| kind          | verdict   | why                                                                        |
| ------------- | --------- | -------------------------------------------------------------------------- |
| `adding`      | withdrawn | `AddActivityControl` swaps its own label to `Adding ${type}` and presses   |
| `loe`         | withdrawn | the trigger swaps to `Pick start driver` / `Pick finish driver`            |
| `linking`     | withdrawn | `LinkControl` swaps to `Linking · FS`                                      |
| `marquee`     | kept      | `Select` keeps its label when armed — only the pressed wash changes        |
| `linkPicking` | kept      | names the picked predecessor; no control carries it                        |
| `linked`      | kept      | not an armed-tool statement at all — ADR-0064's confirmation, with an Undo |

**Nothing about what an AT user hears changes, and my first statement of why was wrong.** The plan
said the band was the live region and that withdrawing a statement would therefore withdraw an
announcement. It is not: `CanvasModeBand` passes no `role` (`CanvasModeBand.tsx:112`), and every
transition is announced by a separate `useEffect` on `mode` in `TsldPanel`
(`TsldPanel.tsx:813-836`). The band is visible chrome only, which is exactly what makes withdrawing
three of its six kinds cheap — and I had the mechanism backwards until the architecture review said
so and the file confirmed it.

What the statements carried besides the mode word were two shortcuts documented nowhere else —
`or click for a day`, `Ctrl to add`. Those move onto the armed trigger as an `sr-only`
`primaryDescription` with `aria-describedby`, never a `title`: no browser shows a tooltip on
keyboard focus.

### D4 — The pen names its holder on the pill, and its sentence stops painting

The pen sentence is **126 px** of the facts block, and it was the only thing on screen naming who
holds the plan — `lock-view.ts` returns eleven views and five of them carry a holder, none of which
reached the pill. It cannot simply go. It becomes `sr-only` — still
`role="status" aria-live="polite"`, still tone-tinted so nothing about the announcement changes — and
the holder's first name moves onto the pill itself (`Locked · Sam`).

`firstName` was module-private in `lock-copy.ts` and is now exported rather than re-implemented
beside the pill; a second derivation of "which part of a name goes on a badge" is exactly the drift
ADR-0065 records.

### D5 — The dock shows at most one transient strip

Two strips could be live at once — the conflict banner and either the mode band or the empty-plan
notice — so the row grew a line for a state nobody had designed. Precedence, not a width budget: the
conflict banner outranks both. Removing the dead `!modeStatement` guard inside the `select` branch
fell out of writing the test.

**Three versions of that test passed with the guard removed.** The first two were vacuous; only the
third — arming the marquee _while_ a conflict is showing — goes red against the old code. A gate is
finished when the defect it names can make it fail (ADR-0110 D5), and two thirds of the way there it
looked finished.

### D6 — The object bar takes the deck's card, at a geometry that costs nothing

The product owner asked whether the bar should look like the other toolbars. It should, and the class
moves to `toolbar-styles.ts` as a `toolbarCardVariants` CVA rather than being copied: the deck's card
and this one are now the same declaration with a `density` variant.

**`flush` is an output of measurement, not a preference.** The first candidate — border, padding and
radius, the deck's own `comfortable` — cost the single line D7 had just bought (41 → 79 px). Three
candidates were measured; background and radius alone keep the row at 41.

### D7 — `Report progress` becomes `Progress`, on both surfaces

The rename is worth **46 px**, and it is the one relabel taken of four proposed. Two of the three
declined were declined on substance rather than on cost. `Zoom to selection` → `Zoom selection`
(16 px) **has already been tried**: it shipped as the shorter `Zoom to`, a sentence with its object
missing, and a journey caught it — the reasoning is in the registry beside the label
(`selection-actions.tsx:740-745`, WCAG 2.4.6). `Clear visual placement` → `Clear placement` (~46 px) drops the word
distinguishing a **Visual**-mode hand placement from an **Early**-mode computed one — the
distinction ADR-0033 exists to make — so the saving would be bought by making the control ambiguous
about which of two scheduling modes it acts on. It lands on the
selection bar **and** the activities table together, because ADR-0093's whole subject is those two
surfaces naming one action; renaming one would recreate the divergence that ADR removed.

The full sentence survives as the control's `description`, so the accessible name shortens and the
explanation does not disappear.

### D8 — The responsive fold is dropped

Folding `Logic`, `Resources`, `Steps` and `Edit` into one `Edit ▾` is worth **226 px**, the largest
single saving on the table. **Product-owner decision, 2026-08-26: dropped.** It changes what the bar
is _for_ — four doors into one editor become one door and a menu — and that is a different epic from
making the row fit.

### D9 — The IA critique is recorded, not acted on

The ux review's larger point — fold the four editor doors into the editor's own tabs and put the
rarer actions behind a `⋯`, mirroring the activities table — is probably right, and it is the same
different epic. **Product-owner decision: record it here as a live question.**

### D10 — Two shared primitives change, and both changes are named here rather than left in a diff

Withdrawing a statement and folding a card both landed in `components/ui/`, which makes them
decisions rather than milestone details — and §19.13 requires **accessibility-reviewer** and
**component-reviewer** on a primitive's keyboard or focus model before it ships, which is what the
gate pass above was.

**`ToolbarSplitButton` gains `primaryDescription`**, an `sr-only` sibling linked by
`aria-describedby` on the primary half, live only while the tool is armed and **outranked by
`primaryDisabledReason`** when both apply. The precedence is exclusive rather than composed, which is
the opposite of `MenuItem.srDescription`'s rule and deliberately so: a "how to operate this live
control" hint has no meaning once the control is shut, whereas `MenuItem`'s standing fact ("3
conflicts") is true either way. Never `title` — no browser shows a tooltip on keyboard focus, which
is the house failure `ToolbarSplitButton`'s own docblock records catching four times, and which this
epic then committed one field along (see the gate pass).

**`Deck` refuses to fold a group holding an armed tool**, shading the caption with `aria-disabled`
plus a described reason and keeping it in the roving sequence (ADR-0082). It belongs in the primitive
and not above it: the fold state, its `localStorage` persistence and the unmounting are all `Deck`'s,
so there is no way to implement "do not let a fold hide something in use" from outside without
duplicating them. `active` is a registry-level concept, so the primitive learns nothing TSLD-specific
— which is exactly why the registry had to start publishing it truthfully.

## What the measurements said, including where they contradicted the plan

**Withdrawing three mode statements bought no canvas height at all, and that was known before the
work rather than discovered after.** The mode band renders inside `CanvasDock` (ADR-0092), so it has
never pushed the scene down — its 410 px is **width inside the foot row**, not height above it. The
statements were withdrawn because they restate their trigger, and the width they free is spent on
the wrapping row below. The band's own render-site docblock claimed "reserved chrome **above** the
scene", which was true of ADR-0064's original placement and has not been true since ADR-0092 moved
it; it is corrected here rather than left, because that sentence is what makes the milestone look
like a height saving.

**Freeing 164 px bought zero height.** After D3 and D4 the row measured 77 px at 1920 and 117 px at
1646 — _exactly_ what it measured before. A wrapping row breaks between **items**, not by total
width, so slack inside a line that still cannot fit another control changes nothing a reader can see.
This is the sixth consecutive width expectation on this surface contradicted by its own measurement,
and the first where the arithmetic was right and the **model** was wrong.

**Then one 46 px rename bought a line at both widths.** With D7 the content reaches 1604 px:

| viewport | row height before | after              | canvas gained |
| -------- | ----------------- | ------------------ | ------------- |
| 1920     | 77 (two lines)    | **41 — one line**  | **+36 px**    |
| 1646     | 117 (three lines) | **77 — two lines** | **+40 px**    |

The 1646 result was not predicted at all; the prediction was made about the width where the line
boundary was known to be near.

**Two qualifications, because 1604 px is the row's _narrowest_ state.** The margin at 1920 is
**15 px**. A **summary** selection adds `Dissolve` and `Duplicate band`; a **stale** schedule adds a
sentence and a `Recalculate` button. Either pushes it back to two lines. So the claim is _at 1920, in
the common state, the row is one line_ — not _the row is one line_.

## What the instrument got wrong

Three runs, two of them spent on the harness rather than the product, and **both mis-picks were
caught by the reading's `text` field, not by its number**.

1. The first draft queried `[data-toolbar-group]` and `[data-canvas-dock]`. Neither attribute
   exists — found by grepping for them before the first run.
2. The selection step recorded `{ skipped: 'no listbox option found' }` at both widths, in a run that
   otherwise passed, for the `sr-only` reason in D1. **`m5-canvas-foot.json` carries the same skip**,
   under a docblock stating the row was measured "in three states": ADR-0113's foot-row reasoning
   never saw a selected row. Its figures are sound for the states it did measure; the selected state
   simply was not one of them. This probe now **fails** rather than skipping.
3. The dock strip was then read as `row.querySelector('[role="status"]')`, which matched the **pen
   sentence** and returned a perfectly plausible 126 px with the wrong text. The next attempt matched
   the **facts block**. The third dumps every direct child beside the answer, so a fourth mis-pick
   would be visible rather than plausible.

## The gate pass

Four specialists over the combined diff — ui-architect, accessibility-reviewer, ux-reviewer,
component-reviewer. **Component passed with nits; the other three blocked, on eight defects that had
passed a human read**, and two of the eight were reached independently by two reviewers each.

**The largest is this epic's own correct rule applied to one control and not its neighbour, one
milestone after it was written down.** `hostsDock` exists because an outlet registered inside a
`display: none` pane portals its contents somewhere no reader can reach, and its docblock says so at
length. M4 then added `PlanFactsOutlet` to the same row, forty lines below that docblock, **ungated**
— so on the narrow single-pane layout the plan's facts, its schedule state, its only `Recalculate`
control and the pen's `role="status"` region all portalled into the hidden pane, and the shell's
`empty:hidden` status row collapsed to nothing. The facts vanished entirely on the smallest screens,
while three docblocks and this spec's own edge-case table said they render in the shell. Nothing
could have caught it: every unit suite runs in jsdom, where `useMediaQuery` defaults wide and
`display: none` means nothing because there is no layout. The prop is now `hostsPlanSlots` and gates
both — **named for the pair, because naming it for one outlet is how the other one got missed** — and
the journey gained one `setViewportSize` call, which is the whole gate.

**The second is D5's own guard protecting the one tool it did not need to.** `Deck`'s
"a group holding an armed tool refuses to fold" reads `ResolvedToolbarItem.active`, i.e.
`item.isActive?.(ctx)`. Add and Link are `render` items that compute `pressed` locally and set no
registry `isActive` — Add's lived inside the `CANVAS_AUTHORING_ENABLED` ternary's **flag-off** arm,
so in every shipped build it was absent. The guard therefore fired for `marquee-select` alone: the
one tool whose statement D3 **kept**, and for neither of the two it withdrew. A planner could arm
Add, fold `Author`, and be left with a tool armed, no trigger, no statement and no exit but Escape —
the founding ADR-0064 defect, reintroduced by the fix for a different one. `Deck.test.tsx` could not
see it, and its fixture is why: a synthetic `onActivate` item carrying `isActive: () => true`, a
shape the real registry does not contain. That is ADR-0081 **with the test as the concealer**, and
the gate for it now lives against the real registry (`armed-tools.structural.test.ts`) rather than
against a fixture.

**The third is D4's accounting stopping at the tone it was written for.** Two lock states cannot put
their fact on the badge: `lost` has no actor to name, and `editing`-with-an-incoming-request has an
actor the badge is **forbidden** from naming, by the same rule that makes `badgeName` correct
elsewhere. Both would have shown a changed badge, a pair of buttons and no visible statement of what
happened or who was asking — and `lost` is the single transition ADR-0028 exists for. The sentence is
now painted in exactly those two states (`LockView.messageVisible`), which pays M3's 126 px only
where it buys something.

**Then the shortcuts sheet, raised independently by ux and accessibility.** D3's justification for
withdrawing three statements says their remainder "also goes in the shortcuts sheet", and
`PlanShortcutsHelp.tsx` was never touched. `Esc` was already listed generically and now names
disarming a tool; `or click for a day` was listed nowhere, so a sighted mouse-only planner had
**strictly less** access to that gesture than before the epic — the `sr-only` `primaryDescription`
serves AT and nobody else. **Both reviewers corrected my framing of it**, and the correction is worth
keeping: I had scoped the loss to sighted _keyboard_ users, and the old band was plain visible DOM,
so the loss is general. The AT half of the change is fine; it is the sighted half that regressed.

**And the fifth is this ADR contradicting the measurement it cites.** §C1d reproduced the pre-fix
state in a browser and found that focusing a clipped control moves its rect by **zero** — the clip is
an ancestor's `overflow-hidden` with nothing scrollable to move. The disproved sentence ("keyboard
reached them, because a browser scrolls a focused element into view") survived verbatim in this ADR,
in `selection-actions.tsx` **two lines above a citation of the section next to the one refuting it**,
and in the journey. ADR-0076 Class 3, by one hand, inside one epic, against that epic's own
measurement. The changeset had it right throughout.

Three more, each small and each the same shape: a comment asserting the fit gate cannot see the
selection bar, in the commit that widened it to sweep exactly that bar; `docs/TECH_DEBT.md` **#124**
left `open` and still describing the bar as floating and structurally unable to overflow, four days
after M0 measured it overflowing by 134 and 408 px (now closed, with the expired reason recorded —
**a deferral whose reason has lapsed reads exactly like one whose reason still holds**); and the new
object-action sweep shipped **without** the `invisible` filter its model carries, so a control painted
at 0 px would have passed it silently — which is trap 2 in that file's own header, and this defect
class's exact shape.

The component review's own finding is recorded rather than waved through: the dock's precedence can
suppress the **`linked` confirmation**, which carries an `Undo` button and not merely a sentence, and
D5's stated cost named only the sentence. It stays accepted — the two barely co-occur, `Ctrl+Z` is
bound throughout, and the suppression is **recoverable**, because `modeStatement` is derived and the
gate is a render-time ternary — but the recoverability is now a test rather than a sentence.

Suggestions folded: the `density` variant renamed to `chrome: 'boxed' | 'bare'` (both reviewers; the
old name meant spacing everywhere else in this codebase and this one also turned a border on, and its
second branch was a **no-op**); a dead `loe` statement variant deleted, along with the one test case
exercising it — which turned out to be the one arm whose "the screen and the live region cannot
drift" claim was already false, since LOE announces bespoke sentences from its own effect; a stranded
docblock describing a different component; three citations re-pointed at **symbols rather than line
numbers**, which is what drifts; and the spec's and plan's stale "`Report progress` → `Progress` is
declined" rows corrected toward the code.

**One of the architecture review's own claims was wrong and is corrected here rather than absorbed.**
It reported that the M0 harness's historical relabel map "silently measures zero saving" for its two
renamed keys; `relabelSaving` returns `null`, not `0`, so the two were already distinguishable. The
signal is nonetheless made explicit (`missing: true`), because a `null` in a JSON dump is easy to
read past and that file's own record is a list of mis-picks that looked plausible.

Every fix carries a regression test verified red against the specific defect it guards. Six non-blocking findings are `docs/TECH_DEBT.md` #202.

## Consequences

- The object bar is reachable by pointer at every measured width, which it was not in any released
  build before this one.
- The foot is one row in both panel states, so nothing in it moves when the panel opens.
- The canvas gains 36 px at 1920 and 40 px at 1646 **in the common state**, and gives it back on a
  summary selection or a stale schedule. That is recorded rather than smoothed over.
- `toolbarCardVariants` is now the single declaration of a toolbar card; a third surface wanting one
  takes the variant rather than copying the classes.
- The mode statement no longer duplicates its trigger for three of six kinds. If a fourth kind is
  added, the decision is per kind and has to be made rather than inherited.
- D8 and D9 leave the bar with eleven controls at its widest. The row wraps, so that is legible
  rather than clipped — but it is not _designed_, and the IA epic is owed.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction.
