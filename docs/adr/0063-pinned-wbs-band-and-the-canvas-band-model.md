# ADR-0063: The pinned WBS band, and the canvas band model

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Technical Lead, Product Owner
- **Spec:** [`docs/specs/wbs-improvements/`](../specs/wbs-improvements/feature-spec.md)

## Context

ADR-0038 gave activities a parent tree and a `WBS_SUMMARY` type. Two years of P6 habit say
that once a plan has a WBS, the first thing a planner wants is to **see the programme at
band level** — Substructure, Superstructure, Fit-out — and only then drill into the activities.
The TSLD shows neither: a summary is one more bar in one more lane, indistinguishable at a
glance from the work it contains, and there is no view in the product that answers "what are
the phases of this job and when do they run".

The canvas already has a precedent for exactly this shape. ADR-0049's resource strip is a
**separate `<canvas>` layer** with its own reserved height subtracted in `measure()`, its own
palette ref and dirty flag, painted from the **same `viewRef`** as the scene so its columns
line up by construction rather than by arithmetic that has to be kept in step. A WBS band
pinned at the **top** is the same construction reflected.

That precedent is what makes this decision worth writing down rather than just building. Three
things about the band are not implementation details:

1. **It changes what the scene draws.** If summaries move into the band, they leave the scene —
   and with it the parallel focusable DOM layer ADR-0026 D7 built by hand. Getting that wrong
   removes rows from assistive technology while the picture still looks right.
2. **It reserves space at both ends of the canvas.** ADR-0049 reserved one band, at the bottom.
   Nothing in the code says a second reservation at the top is safe, and something in the code
   says it is not — see §5.
3. **It caps depth.** A WBS can nest arbitrarily; a band 40 pixels tall cannot. Where the cap
   falls is a product decision with a visible consequence, not a constant to pick in a painter.

## Decision

### 1. The band is a fourth canvas layer, top-pinned, painted from the same `viewRef`

Between the ruler and the scene, in its own `<canvas>`, with its own `wbsBandPaletteRef` and
`bandDirtyRef`, repainted when `movedThisFrame || bandDirtyRef.current` — the resource strip's
loop, mirrored.

It imports `screenXOfDay` and `daysBetween` **verbatim** from the render model. It does not
re-derive the axis. A second date→pixel implementation is how two views come to disagree about
where a Monday is (ADR-0059 §"the time axis is shared, not reimplemented", same reasoning), and
here the disagreement would be between two halves of a single picture, a pixel or two apart —
visible to nobody until a planner uses the band to read a date.

The band is **not** a negative lane. `laneIndex`, `screenYOfLane`, `laneAtScreenY`, `cull`,
`hitTest` and `packLanes` are untouched, and the persisted lane semantics are unchanged, so
ADR-0026 needs no amendment.

### 2. The band is select-only

Click a bar, that summary becomes the canvas selection — the same selection the scene
publishes, so the toolbar, the selection-actions bar and the editor all follow. That is all.
No drag, no resize, no link, no lag anchors, no gesture machine.

This is not a scoping compromise, it is what the object permits. A summary's dates are
**engine-derived** — a rollup over its subtree (ADR-0038 / ADR-0035 §24). There is nothing on
it to drag: dragging a summary's edge would have to mean something about its children, and no
answer to "what?" is better than the two obvious wrong ones (move them all, or silently pin the
summary and let the rollup contradict it). It also removes the largest source of risk from the
largest item in the epic, which is a real benefit, but it is the second reason and not the
first.

### 3. Rendered depth is capped, and the cap is visible

The band renders summaries at **depths 0–2, stacked** — three sub-rows within the band, deepest
last. A deeper summary keeps today's treatment in the scene and is **not** silently absent from
the picture: the band's accessible description states the cap and that deeper groupings remain
below.

Depth 0 alone was considered and rejected: on a real programme, depth 0 is often one node
("The Works"), and a band showing one bar spanning the whole plan is a decoration. Uncapped was
rejected because the band's height would then be data-dependent, and a band that grows as a
planner nests would take the canvas away from them a row at a time.

### 4. Summaries leave the scene when the band is on — and the a11y count is invariant

With the band on, `WBS_SUMMARY` activities within the rendered depth are drawn in the band and
**not** in the scene. Drawing them in both would put the same object on screen twice at
different sizes, which is how a planner comes to believe a summary has two sets of dates.

The load-bearing consequence is accessibility, not pixels. The scene's parallel DOM layer
(ADR-0026 D7) is the only way an AT user reaches a bar, so a summary leaving the scene must not
stop being reachable. The invariant is stated as a test rather than a paragraph: **the count of
AT-reachable activities does not change across the toggle.**

An earlier draft of this decision said the summaries should **move** into a DOM group of the
band's own. Building it showed that to be the worse of the two options, so it is not what
shipped. The listbox is driven by the plan's activities, not by what the scene paints, so
excluding a summary from the paint cannot remove it from the accessibility tree — the invariant
holds **by construction**, with no second list to keep in step and no window in which a summary
could exist in neither. A separate band group would have had to be built, ordered and
de-duplicated against the first, and every one of those is a way to lose a row. The test stays,
because "by construction" describes today's code rather than promising anything about
tomorrow's.

### 5. `RULER_HEIGHT` stops being the scene's top offset

Today three separate features convert a canvas-relative y into a container-relative y by
adding `RULER_HEIGHT`: the create popover's anchor, the cursor date readout and the drag
ghosts. That is correct only while the ruler is the sole thing above the scene — which is
exactly the assumption this ADR breaks.

So the constant is replaced by a single derived `sceneTopOffset`, and **every** call site routes
through it. This is the specific thing most likely to go wrong in the whole epic, and its
failure mode is quiet: the band renders, the canvas looks right, and the create popover opens
forty pixels above where the user clicked. It gets its own regression test with the band on and
off.

### 6. The band is a `View▾ ▸ Structure` toggle, and it is off by default

It joins the ADR-0056 `Month bands` switch under the same group. Default off: the band takes
canvas height, and ADR-0031's canvas-maximal layout is a decision this must not quietly reverse
for every existing plan.

### 7. The derived "Unassigned" bucket appears in the band, and is not selectable

The band's last bar is the derived bucket from `features/wbs/model/wbs-groups.ts` — the same
module the Gantt row model consumes, so the two surfaces cannot disagree about what "unfiled"
means. It carries no activity id, so it is announced as a group and **cannot** be selected;
selecting it would hand the host a row the server has never heard of.

Why the bucket is derived rather than a persisted default summary per plan is recorded in the
spec (§4.6) and is not re-argued here. The short form: a persisted bucket would put a new node
and a non-null `parentId` into `computeSchedule`'s input for **every plan in the system** —
the byte-identity the ADR-0034 parity gate exists to protect — spent on a display feature.

### 8. Dissolve is the inverse of building a band, and it is only half reversible

Removing a grouping while keeping the work is a first-class action (`POST …/dissolve`): the
summary's direct children move up to its own parent, then the summary is soft-deleted. Before
this, the only way to undo a mis-built band was to delete it, and deleting a summary cascades
to its whole subtree (ADR-0038) — so a planner correcting a grouping mistake destroyed forty
activities' worth of work.

The consequence worth stating, because every other destructive action in this app is reversible
by restore and this one is not: restoring a dissolved summary brings back **the summary only**.
Its former children stay where they went. The confirmation says so in those words, and the
client records dissolve as a **non-undoable boundary** that truncates the undo stack (the
ADR-0048 M2 cascade-delete rule), because an inverse composed from the existing mutations would
re-create a _different_ summary under a new id.

## Consequences

- **The CPM engine, the API's schedule path and the ADR-0034 recalc parity gate are untouched.**
  The band is a painter over persisted columns; the epic's only writes are to
  `activities.parent_id`, which the engine already reads.
- **ADR-0052 M4 is amended:** a summary's bracket glyph now has two possible homes, and which
  one it takes depends on a view toggle.
- **ADR-0055 §4 / ADR-0056 are amended** by one more `View▾ ▸ Structure` member. The registry
  is a `Record`, so an omission is a compile error rather than a missing menu item.
- **ADR-0049 is generalised, not superseded:** the canvas now reserves bands at both ends, and
  `measure()` subtracts each independently. Inactive ⇒ subtracts `0` ⇒ the scene is
  byte-for-byte what it was, which is what the flag-off parity paint test asserts.
- **The draw budget grows by O(rendered summaries + 1)** — typically under 50 bars against the
  scene's 2,000. Pinned by a counting-stub test asserting the _shape_ of the per-frame cost,
  not a millisecond count, because a CI runner's absolute timings are noise (ADR-0054).
- **ADR-0038 is referenced, not edited.** It remains the record of the hierarchy; this ADR
  records what is drawn and what may be done to it.

## Alternatives considered

- **Draw summaries as wide background bands behind their lanes, in the scene.** Rejected: it
  reuses the lane coordinate space for two meanings, so `packLanes` and `hitTest` both have to
  learn about summaries, and a summary spanning non-adjacent lanes has no honest rendering.
- **A DOM overlay pinned above the canvas.** Rejected: it would have to re-derive the axis from
  the viewport on every pan frame to stay aligned — the exact drift §1 exists to prevent — and
  the alignment would be correct only as often as the two implementations agreed.
- **Make the band editable (drag a summary to move its subtree).** Rejected for now, per §2.
  It is a coherent future feature and would need its own decision about what moving a rollup
  means for the activities under it; it is not a detail of this one.
