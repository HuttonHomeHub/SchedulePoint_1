# ADR-0142: A remedy is measured before it is built

- **Status:** Accepted
- **Date:** 2026-09-14
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0100](./0100-the-canvas-minimap-an-invariant-picture-and-a-dom-rectangle.md) — **D5**
  (the draw order, again) — and [ADR-0141](./0141-a-thumbnails-legibility-is-a-pitch-not-a-zoom.md),
  whose Consequences left two questions open for the product owner
- **Spec:** [`docs/specs/tsld-minimap-visual/`](../specs/tsld-minimap-visual/) — the evidence is
  `m0-measurement.md` §§15–17

## Context

ADR-0141 closed with two questions it deliberately did not answer, both of the form _what should
the minimap draw_: the lane compression (178 lane indices mapped linearly into 120 px), and the
data-date vertical painting over any zero-duration activity standing on it. The M5 UX review added
a third — that the panel's chrome had been recorded as needing "no change" by the person who built
the picture fix, where the old application's minimap border was primary-coloured and ours is
neutral grey.

The product owner answered all three, choosing the option recommended in each case. Two of the
three are now built. **The third is not, because measuring it before building it showed it does
nothing** — and that is what this ADR is for. It would otherwise have shipped as an identity
transform under a changeset saying the lane axis was fixed.

## Decisions

### D1 — The lane axis is left alone. Occupied-lane rank is the identity map on a packed plan.

Mapping the lane axis by **occupied-lane rank** — collapsing lanes that hold nothing so only lanes
carrying work consume height — was measured against the live database before any of it was written.
It collapses **zero** lanes on every plan in the local catalogue, including the 2,160-activity
flagship fixture: 178 lane indices, 178 occupied.

That is structural rather than a property of the fixture. `packLanes`
(`packages/layout/src/pack-lanes.ts:78-84`) opens a lane **only** when no existing lane is free, so
a packer cannot leave an empty one; on any plan whose lanes came from Auto-arrange or from the
interchange commit's phase 3 (ADR-0069), the rank map is the identity.

It is **not universally inert**, and the refusal is not widened past what was measured: it would
collapse lanes on a plan the packer never reached — ADR-0069's phase 3 is best-effort, so a failed
layout leaves an import at one lane per source-file row — and on a plan whose lanes have been
emptied by deletion or hand-placement. None of those is the plan the complaint was about.

**What the dominant term actually is, measured** (§15.2, the flagship plan at the shipped
200 × 120): the box is **9.5 % inked**, **every one of the 120 rows carries ink**, bars collide at
**0.94 per inked pixel** — so the decimation policy is barely firing — and **99 % of bars (2,146 of
2,160) are floored to the 1 px minimum**. At 0.0456 px/day an activity must run 22 days to earn a
second pixel and almost none do. The axis that compresses this picture out of legibility is the
**day** axis, and no lane remapping touches it. The minimap at scale is a dust field, and that is a
faithful rendering of a plan that really is 2,160 short activities across twelve years.

The remaining candidates all trade truthfulness for ink — a higher bar-width floor overstates
duration by 22–44 days at this scale, a bigger box costs the diagram the pixels the last five epics
spent recovering — so the recommendation on record is to accept it. That is the product owner's
call and is not made here.

### D2 — The data-date vertical draws beneath the bars. ADR-0100 D5 gains the rule it was missing.

Draw order becomes ground → tiers → **data date** → non-critical → near-critical → critical.

D5 says paint order IS the decimation policy, and the policy ranks by urgency so the critical path
survives a 1 px merge. The data date was placed last for the same reason and the consequence was
not foreseen: **a mark that outranks the entire bar ladder does not win a pixel, it removes an
activity class from the picture.** A milestone is zero-duration by definition, so it has no width to
lose the collision in; the measured plan holds 76 of them, and the loss is unreportable from outside
because a bar that is never drawn looks exactly like a bar that does not exist.

So the rule is that the data date **outranks texture and does not outrank plan data**. It is an
addition to D5 rather than an exception to it.

§11.4's objection to this option is answered rather than stepped over. It said the bars would then
hide the data date on a dense plan; bounded, the vertical is 120 px tall and a bar is 0.674 px, so
that needs work standing on the data date across most of the lane axis. On the flagship fixture the
160 degenerate zero-span summaries do exactly that — and the resulting dotted column is a true
statement about that plan, since those summaries were being painted out too.

**That cost is measured on the fixture this document has twice disowned, and the M8 UX review was
right to say so.** Real summaries roll up actual date ranges; they do not all sit at zero span on
the data date. On a plan with a handful of milestones genuinely there, the outcome is a mostly
intact line with occasional interruptions. On this fixture it is closer to a blue column with a grey
line behind it — and the minimap's job is **orientation**, so ~90 % coverage could plausibly read as
a wide bar rather than as the data date. The decision stands, because erasing real activities to
keep one line clean is the worse failure and that is not fixture-dependent; what is **not** settled
is the cost, and a cheap mitigation exists if it turns out to matter (reserve a pixel or two at the
top and bottom of the picture for the vertical, the halo logic one element over, without reverting
anything).

### D3 — The panel border is the diagram's primary, because the panel's ground is the diagram's ground.

The widget floats over the canvas and its own ground is `--canvas` — the same token. Its border is
therefore the entire colour separation between the two, with `shadow-md` as the only other channel,
and at the neutral grey it measured **1.17:1** against that ground. `--primary`, which
`[data-surface="canvas"]` rebinds to `--plot-primary`, measures **3.15:1**. Gated in
`token-contrast.test.ts`, verified red against the incumbent.

**WCAG 1.4.11 applies because of the widget, not because the two grounds match.** That distinction
is the M8 accessibility review's correction and it is kept because the wrong reason generalises
badly: ADR-0055 already settled that `--border` is decoration and 1.4.11-exempt while `--input`
identifies a control and is gated, so a `Card` sharing its background with the page stays exempt at
1.17:1 and "same ground on both sides" cannot be what brings a boundary into scope. What does is
that this panel is a `role="group" tabIndex={0}` composite widget with arrow-key pan, a draggable
rectangle and Escape to dismiss — a control boundary rather than a divider. The matching grounds are
the evidence that the old value was invisible; the interactivity is why the floor applies at all.

The focus ring was checked and is unaffected: `ring-2` compiles to a hard-edged band starting at the
border-box edge, so it sits **outside** the border with the ground as its neighbour at **5.30:1**,
which is the graded value. Its ΔE 15.60 from the border is due diligence and **not** an SC number,
and is labelled that way rather than quoted as though both figures were gates.

`border-primary` is a Tailwind utility deliberately: it compiles to `var(--primary)` because the
theme mapping is `@theme inline`, so it follows the surface rebind — where a `getComputedStyle` read
of `--color-primary` would not, which is ADR-0102's finding. Only a browser can tell those two apart,
since jsdom applies no stylesheet and both navy and blue are plausible borders, so the journey
asserts the resolved sRGB and was verified red at `oklch(0.907 0 0)`.

**The border shares its value with the non-critical bar ink exactly, and the bitmap is inset from
it by one pixel.** That is not spacing. `worldExtent` takes the plan's actual extremes, so on every
plan a bar starts at x = 0, one ends at x = width and one sits at y = height — the collision is a
property of the mapping, not of any fixture, and it fires whenever the extreme activity is
non-critical. `p-px` makes the border's inside neighbour `--canvas`, the pair it is gated against,
for 2 px of panel size and no data at all.

The colour remedies were measured first and both fail. **The old application's border was navy, not
blue** (its `main.css` `:root` declares `--primary-color: #14213D`, and its `#minimap-container` rule
takes `border: 1px solid var(--primary-color)`), which is **1.00:1** against
`--canvas-minimap-frame`: copying it exactly would have collided the panel border with the viewport
rectangle beside it, because that app paired navy with an amber viewport band where ours is dark.
And no blue clears 3:1 from both a near-white ground and the bar ink, which pull opposite ways.

**This paragraph said the merge was "a property of the fixture rather than of the product" until the
M8 gate pass.** It was wrong, the UX review rejected it on the mapping rather than on the pixels,
and the wrong version is recorded here rather than replaced — an ADR that quotes ADR-0058 at its
reader and then silently edits its own false claim is worth less than one that does not.

### D4 — A gate is not the only instrument that can be green for having tested nothing. So can a plan.

D1 is the third time in this epic that an approved remedy has been measured before building and
found not to fix what it was approved to fix (§10.4 was the first, when omitting summaries moved the
lane count 178 → 164 rather than 178 → 9; §14.3 was the second, when the epic's only visual evidence
turned out to be the one state in which its rank-1 fix is invisible).

ADR-0058's rule is _verify the claim; do not trust the document_, and ADR-0081 extends it to a plan's
tasks. This extends it once more, to a plan's **remedies**: an approved action is a claim that it
will work, and approval does not make it one. The cheap test is to measure the remedy's own effect
size before writing it — here, one SQL query against the seeded catalogue, before a line of code.

## Consequences

- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction.
- **The lane compression is still open**, and is now open with numbers rather than with an
  intuition: §15.2's figures say the day axis is the term, and every candidate remedy for it costs
  either truthfulness or canvas. A future reader reaching for occupied-lane rank should read D1
  first.

  **What D1 does NOT close, flagged by the M8 UX review and agreed:** the eight measured plans are
  all freshly packed, and the flagship is the same fixture §10.3 disowned as degenerate — its 160
  `WBS_SUMMARY` rows are zero-span placeholders at the data date, not real subtree rollups, and
  §10.3 says in terms that whether a genuine rollup forces its own lane is **untested**. So the
  structural half of D1 is settled for any packed plan and the **domain** half — "a plan with real
  WBS structure", which was the review's original finding — is not. The two shapes that would test
  it are an **imported plan whose ADR-0069 phase-3 pack never ran**, and a plan with **multi-day WBS
  rollups**; both are cheap SQL away, and neither has been measured. `docs/TECH_DEBT.md` #323 names
  them as the re-open trigger rather than waiting for a complaint.

- The M5 UX review's chrome challenge closes, and the way it closes is the useful part: it was right
  on a measurement, and was declined because nobody had taken the measurement.
- `apps/web/.screenshots/m8-border.png` — **git-ignored, per the `.gitignore` convention that a
  screenshot is evidence and the prose is the durable record** — is what the UX review sampled to
  show the border/bar merge, and it is the reason D3's first rationale did not survive: a shot
  offered as "the one unrepresentative case" turned out to be the general case.
