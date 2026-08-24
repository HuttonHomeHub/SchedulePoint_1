# ADR-0109 — A command surface wraps, and the leading edge belongs to the work

- **Status:** Accepted (M1–M5 landed 2026-08-24)
- **Date:** 2026-08-24
- **Supersedes:** the width-ladder half of ADR-0090, ADR-0091 and ADR-0094 M0-T1; ADR-0099 D1 (the
  tool rail); ADR-0099 D2's Project-Explorer-as-drawer-subject
- **Amends:** ADR-0031 (the toolbar's rendering, not its taxonomy), ADR-0055 §3, ADR-0056 F7b's
  default, ADR-0093 (Recalculate's placement)
- **Builds on:** ADR-0028, ADR-0032, ADR-0082, ADR-0088, ADR-0097, ADR-0101, ADR-0102, ADR-0106

## Context

Four consecutive epics worked this product's command surface — ADR-0090 (the row does not fit),
ADR-0091 (a mode is not a command), ADR-0092 (the canvas dock), ADR-0094 (one meaning of conflict)
— and a fifth, ADR-0099, rebuilt the shell around it. Each asked a version of the same question,
_does the row fit?_, and each answered by shaving something. ADR-0099's own retrospective already
names the shape: the answer was always "nearly", so the answer was always to shave.

The product owner's verdict after all five was that the application still looked poor, and their
specific complaints were three: the overflow menu was not what had been agreed, all commands should
be visible when there is room, and the colour scheme "isn't working in this design — it was in the
old SchedulePoint repo but somehow it doesn't here". They then set the rulebook aside for one epic
and asked for a redesign from the ground up, with the standards to be rewritten afterwards from
what shipped.

**The diagnosis came from reading the old Flask app rather than describing it from memory**, and
it inverted both halves of the problem.

Its toolbar **wrapped**: `flex-wrap: wrap` over five labelled group cards holding fifteen buttons.
It had no overflow menu because it never needed one.

> **Re-verified against the source rather than from memory** (ADR-0076 §19.10), because this one
> sentence is what the whole epic turns on. In the old app's checkout: `static/css/main-toolbar.css`
> declares `flex-wrap: wrap` twice — line 13 on the toolbar container and line 56 on each group's
> `.group-content` — beside `background-color: var(--primary-color)`, `border-radius: 8px` and
> `box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15)`, which is the card treatment. `templates/main-toolbar.html`
> contains **5** `toolbar-group` elements, **15** `<button>`s, and **zero** occurrences of
> "overflow" or "⋯". The premise all four command-surface epics
> tuned — that a command surface must stay one row tall — was never a requirement anybody had stated.
> It was inherited, and every subsequent decision was a consequence of it: the `ResizeObserver`, the
> per-item width cache, the priority ranking, the band floors, the hysteresis, and the `⋯` the
> product owner was complaining about.

And **the palette was never wrong**. `--chrome` has held the old app's `#14213D` since ADR-0102 and
`--chrome-primary` its `#FCA311`. What was missing was surfaces to paint them on: `chrome-band.tsx`
was the only chrome surface in the shell and it was a flat `border-b` bar, with the page's white
running edge to edge above and below it. Figure and ground had a 1px border between them.

## Decisions

### D1 — A command surface wraps; it never hides

`Toolbar`'s horizontal variant is `flex-wrap`, and the plan workspace's surface is a new `Deck`:
four captioned, foldable groups over the existing seven-group registry taxonomy. Every command is
inline at every width. **~1550 lines are deleted** — `toolbar-ladder.ts`, `ToolbarOverflow.tsx`,
the `e2e-toolbar-fit` journey with its config and CI step, and the measuring machinery inside
`Toolbar` itself.

The gate goes with the ladder rather than staying green: `e2e-toolbar-fit` asserts that every
command is pointer-reachable at eight widths, and the workspace no longer has a row or a `⋯` to be
shrunk out of. A gate whose subject no longer exists does not become a safety net by continuing to
pass — it becomes a claim that something is checked when nothing is. What it guarded is now
structural, because flex line-breaking cannot place a child outside its container.

**What this costs is stated rather than glossed:** a surface that wraps is a surface whose height is
a function of its width, so a narrow window buys its commands with vertical space the diagram would
otherwise have. That is the trade the product owner chose, in as many words — all commands visible
when we can.

### D2 — The leading edge belongs to the work, not to chrome

ADR-0099 D1 gave the leading column to a fixed 48 px icon rail and D2 made the Project Explorer a
subject of the trailing context drawer. The product owner asked what the rail was still adding, and
the answer was short: a brand mark, an organisation switcher, six links and an account menu.

The rail is deleted. The Explorer is docked on the leading edge, resizable 200–420 and folding to a
34 px spine, both persisted. The rail's four jobs return to the chrome band's header row, which
renders at every width again rather than below `lg` only.

**This is a reversal and the reason it is not a wobble is that the premise changed underneath it.**
ADR-0099 D2's argument was one panel, one edge, one splitter, two subjects. ADR-0101 then sent the
activity editor back to a modal, leaving the drawer's other subject with **no production registrant
at all** (`docs/TECH_DEBT.md` #156) — so "one panel, two subjects" had quietly become "one panel,
one subject reached through a switcher", and a switcher over one thing is a control that cannot
switch. The drawer mechanism is kept: an `auto` grid column with no child is zero wide, so an unused
drawer costs the stage nothing, and it is what a route uses to host something beside the work.

### D3 — Recalculate is attached to the condition it answers

It leaves the command surface for the status bar, where it appears only when the schedule is behind
the plan. `design.md` §3's phrase for what it was is exact — _a button pretending to be a status_ —
and the arithmetic backs it: auto-recalculation has fired on every structural edit since ADR-0032
M3, so on a healthy plan that command re-ran a calculation that had already run.

Three docblocks of rank tuning (ADR-0099 M5's 95, M7's re-read, ADR-0090 M10's label measurement)
went with it. A command offered only when it can change something needs no rank at all.

The state is a three-member union, and the fourth case a reader meets is the one a client-side edit
counter structurally cannot see: a plan with activities and no computed finish has **never** been
calculated — imported, seeded, or built in somebody else's session. So the state is derived from the
schedule summary as well as from the hook.

### D4 — The diagram is ruled both ways and its ground is quiet

The weekend hatch goes; the alternating month band defaults off (its `View ▸ Structure` switch
stays — a default, not a deletion); lane hairlines arrive. The time axis has had three tiers of
vertical structure since ADR-0056 and the lane axis had none, so a bar three lanes below another had
nothing to sit on.

The hairlines are derived from the **viewport**, never from the activities: the lane range is
arithmetic on `view.originY`, so the layer is O(visible lanes) with no dependency on plan size and
deliberately does not call `PaintFrame.laneRows()`, which is lazy on purpose and which a paint with
the labels and dates layers off never builds. The painter is already 4–6× over ADR-0026 §16's budget
(`docs/TECH_DEBT.md` #75); a new layer that scales with the plan is exactly what must not ship.

### D5 — No feature flag; the rollback is a commit

ADR-0088 D1 established that a `VITE_` constant is inlined at build time, that `docker-publish.yml`
passes no `VITE_` build args, and that therefore **a `VITE_` flag has never been an operator
rollback**. A flag here would be a rollback contract that does not exist, plus a second product
maintained forever. The mitigation is commit boundaries: each milestone is one revertible commit.

## Consequences

- **The CPM engine, the REST API and the database are untouched.** This is `apps/web` only, which is
  what makes the whole redesign revertible.
- The `rail` chrome slot is deleted with its only consumer. `ChromeSlotName` is `rows | drawer |
status`.
- Nineteen journey sites across ten suites shared one `recalculate(page)` helper, whose
  postcondition is what every one of them wanted: the schedule is current.
- Two of the plan's own tasks turned out to describe work that was **already shipped** — arrowheads
  have been filled and batched since ADR-0065, and the criticality ladder has had a gated 1.5:1
  floor since ADR-0097 Landing E. Recorded rather than re-implemented; CLAUDE.md §19's rule about
  re-verifying a spec's problem statement paid for the fourth time.
- The register's own habit held: **the M4 gate audit found a defect in a gate**. The routing
  journey's `linkPolyline` took "the first subpath", which after the hairlines landed was a
  full-width horizontal rule — so its wiring assertion was comparing a lane rule with itself and
  would have reported the link-routing flag as inert while it worked perfectly.

## The obligation this ADR discharges

`docs/specs/workspace-redesign/README.md` records the product owner suspending the ADR register and
the standards for this epic, with an explicit obligation to write the replacement standards
afterwards. This ADR and the reconciliation pass beside it are that obligation. The suspension was
for one epic and is over.
