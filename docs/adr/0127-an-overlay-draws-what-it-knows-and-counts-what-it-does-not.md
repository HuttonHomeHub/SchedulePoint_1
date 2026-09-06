# ADR-0127: An overlay draws what it knows, and counts what it does not

- **Status:** Accepted
- **Date:** 2026-09-06
- **Deciders:** Product owner, engineering

## Context

ADR-0125 gave a planner the delta in words and ADR-0126 gave them the change list. Both are lists,
and a list is the wrong shape for the question a planner is actually asked in the meeting: **"show
me what changed."** A re-sequenced programme reads as a re-sequence on a diagram and as thirty rows
in a table.

The obvious version of this — draw the old plan behind the new one — was put to the product owner
with its costs attached and **rejected** (CQ-2, 2026-09-06): a ghost behind every unchanged bar is a
picture of the plan rather than a picture of what happened to it, and on a 500-activity programme it
is a second plan drawn on top of the first, doubling a painter `docs/TECH_DEBT.md` #75 already
measures at 10.2 % dropped frames at Fit. **The overlay paints the DIFFERENCE.**

Two facts about a canvas make that harder than it sounds, and both are the same fact:

- **A removed activity has no bar.** It is not in `scene.activities`, so it is in no cull set, no
  rect cache and no accessibility listbox. It is precisely what a comparison is for, and it is the
  one thing the live scene structurally cannot show.
- **A link has no geometry of its own.** It is anchored to two bars, so a link whose endpoint is
  gone has nowhere to start.

## Decision

### D1 — The overlay draws the difference, and the difference is narrower than the change list

A bar is ghosted when it **moved** — a different start, finish or lane — or when it is gone. A
renamed activity is a real change whose bar is in exactly the same place, so a ghost for it would be
an outline drawn under its own live bar: invisible, and paid for on every frame. The change list
(ADR-0126) reports it; the picture does not.

Summaries are excluded. Their dates are an engine rollup, so a ghost for one draws the _consequence_
of a change rather than the change — the same argument that keeps them out of ADR-0125's criticality
sets.

### D2 — The lane is recorded, never guessed, and that is what makes removed work drawable

`RevisionGhostBar.laneIndex` is the **frozen** lane (ADR-0126), never the live one. Removed work has
no live bar to sit behind, and putting it somewhere plausible would be a false statement about where
the work was. This is why the product owner asked for `lane_index` to be frozen even though the
overlay paints only the difference (CQ-2b).

It also **disposes of the plan's "reserved band below the scene"**, which was designed for a guessed
position that no longer has to be guessed. A milestone worth recording: the plan's remedy went stale
against a decision taken in its own epic.

### D3 — What cannot be drawn is COUNTED, never dropped and never zero

`ghostsUndrawable` and `linksUndrawable` sit **beside** their arrays, not folded into a length. A
pre-extension baseline records no lane; a removed link may have lost an endpoint. Both are stated.

The reason is specific to this surface: a table can say "showing 10 of 250", and **a diagram cannot**.
A picture missing rows nobody is told about is unnoticeable, which is the absence this whole
programme of work exists to remove, arriving in the one place a reader has no way to check it.

An old side with no dates is **not** counted as undrawable, and the distinction is deliberate:
nothing was lost to a missing column there, the plan was never calculated, and the completion half
already reports that.

### D4 — One router; the treatment is a stroke style

ADR-0065 made obstacle awareness one optional parameter of one `routeOrthogonal` precisely so a
second `routeOrthogonalAvoiding` could not drift invisibly, and ADR-0121's `stackSeries` finding is
the same shape a third time. So an **added or changed** link reuses the line the frame already
computed — bundled, obstacle-aware, arrowheaded, identical to the one underneath it — and a
**removed** link goes through the same `lineOf` closure with a synthetic edge. The counting-stub
gate pins that as two batched strokes rather than a second routing pass.

Removed work is distinguished by **shape** — a strike-through on a bar, a dash on a link — and not
by a second colour. That keeps WCAG 1.4.1 and it needs no new canvas token, which structurally
avoids ADR-0100 M4's defect: a pair absent from `@theme inline` paints **no colour at all** in a real
browser while the contrast gate stays green.

### D5 — The layer does NOT cull by `visibleIds`, and its sibling does

The baseline ghost layer culls by `visibleIds` first, correctly: a baseline ghost always has a live
bar to sit behind, so an off-screen live bar means an irrelevant ghost.

**This layer must not**, and the milestone's own plan said it should — "cull by `visibleIds` first,
as the ghost layer already does". That instruction is right for the layer it was copied from and
wrong here: `visibleIds` is derived from `scene.activities`, removed work is by definition not
there, and following it would have produced an overlay that looked correct on every plan where
nothing had been deleted and silently dropped exactly the rows it exists to show. Verified red
against precisely that cull.

### D6 — No accessible claim is made for a link, and the product says so

ADR-0122's rule is that a picture a screen reader cannot reach is not described by saying it is.

- A **changed activity** already has a route: it is an option in ADR-0026 D7's parallel listbox.
- A **removed activity** has none — it is not in the plan — so it gets a non-focusable `sr-only`
  list **inside** the diagram region (ADR-0122 D2: a landmark-navigating reader lands inside a
  region and never meets a preceding sibling). Not focusable, because it is not selectable: it does
  not exist.
- A **changed link** has none, and **none is proposed.** A link is not a selectable object in this
  product and there is no listbox of edges; inventing one would invent an interaction no other
  surface offers. The overlay states a **count** and points at the change list —
  "2 changed links. Logic changes are listed in words under Changes." — and the toggle's own
  description says the same. Tier 1 is the route, stated rather than implied.

The spoken summary walks the **same array the painter walks**, which is what stops the picture and
its description disagreeing about what is on screen — the ADR-0121 finding, where a legend was
decided by name, listed as a development step, and never written, leaving colour as the sole
channel. `CompareGhost` therefore carries a `name` no painter reads.

### D7 — Composed into the export, not filed as screen-only

`docs/TECH_DEBT.md` #167 files five lens keys as `SCREEN_ONLY` and calls the question live. This one
is not left open: the comparison overlay is the one lens whose whole purpose is to be handed to
somebody who was not in the room, so an exported picture that drops it is ADR-0103's defect exactly.
It rides the same `getSceneLenses` handle its baseline sibling does, so the deliverable is the
planner's picture rather than a second derivation.

The derived scene-parity gate is what forced the decision rather than letting it be deferred.

### D8 — Default off, no `VITE_` flag, and the measurement is UNANSWERED

A `View ▾` toggle, off by default. Not a flag: ADR-0088 D1 established that a `VITE_` constant is
inlined at build time and has never been an operator rollback, so the rollback contract is the
commit boundary.

**The paint cost is not known, and this ADR does not pretend otherwise.** The M0 harness works and
refused to judge: the baseline — the shipped painter with no treatment at all — moved from 0.56 pp
to 1.85 pp dropped frames at 1646 and from 0.93 pp to 10.00 pp at 1920 between two runs an hour
apart **with no code change**, against a 2.00 pp bar. The variation is the container (shared CPU, no
GPU, a software rasteriser), so no number of repetitions here would help;
`docs/specs/revision-compare-changes/m0-condition.md` records the environment as **disqualified**.
The product owner's decision, taken with those numbers in front of them, was to ship default-off and
let a headed run on real hardware decide default-on later.

That run is **owed and outside this epic.** It is named here rather than left as a good intention.

## Consequences

**Frontend-only where it is drawn, and the CPM engine is not imported.** `computeSchedule` is not
reachable from the overlay's module graph; the ADR-0034 recalculation parity gate is untouched by
construction. The server half is two pure functions over projections that already existed.

**Absent ⇒ byte-for-byte today's paint**, asserted structurally rather than described: with the two
scene fields absent every counter in the budget gate is identical.

**A planner comparing two pre-2026-09-06 baselines gets ghosts and no links**, because the old side
records no logic (ADR-0126 D1). The overlay says how many it could not draw.

**The removed-work list grows with the deletions**, not with the plan. On a programme that was
re-imported, that could be large; it is `sr-only` and unbounded, and no cap is imposed because a
truncated list of things that no longer exist is worse than a long one — the reader has no other
route to them.

## Alternatives considered

**Draw the whole old plan behind the new one** (the brief's own "the TSLD painted twice"). Rejected
by the product owner at CQ-2: it needs every activity's frozen lane, doubles an already-strained
painter, and answers a question nobody asked. Available with its costs recorded.

**A reserved band below the scene for removed work.** The plan's own remedy, obsoleted by CQ-2b
freezing the lane — see D2.

**A second ghost router.** ADR-0065's mistake one epic along; see D4.

**A focusable list of changed links.** Rejected by D6: it invents an interaction no other surface in
this product offers, to describe an object the product does not otherwise let anyone select.

**Announcing the overlay's state change.** Rejected: the toggle is a checkbox that announces its own
state, and WCAG 4.1.3's subject is an outcome that would otherwise go unnoticed — not a control that
already speaks.
