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

### D3 — The panel border is the diagram's primary, because the panel's ground is the diagram's ground.

The widget floats over the canvas and its own ground is `--canvas` — the same token. Its border is
therefore the entire colour separation between the two, with `shadow-md` as the only other channel,
and at the neutral grey it measured **1.17:1** against that ground. `--primary`, which
`[data-surface="canvas"]` rebinds to `--plot-primary`, measures **3.15:1** and clears WCAG 1.4.11's
non-text floor. Gated in `token-contrast.test.ts`, verified red against the incumbent.

`border-primary` is a Tailwind utility deliberately: it compiles to `var(--primary)` because the
theme mapping is `@theme inline`, so it follows the surface rebind — where a `getComputedStyle` read
of `--color-primary` would not, which is ADR-0102's finding. Only a browser can tell those two apart,
since jsdom applies no stylesheet and both navy and blue are plausible borders, so the journey
asserts the resolved sRGB and was verified red at `oklch(0.907 0 0)`.

**The cost is stated rather than hidden:** the border shares its value with the non-critical bar ink
exactly. ADR-0141's collisions were two marks inside one picture; this is a continuous rounded rule
enclosing a header row and a picture, and they separate by form.

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
- **The lane compression is still open**, and is now open with numbers rather than with an intuition:
  §15.2's figures say the day axis is the term, and every candidate remedy for it costs either
  truthfulness or canvas. A future reader reaching for occupied-lane rank should read D1 first.
- The M5 UX review's chrome challenge closes, and the way it closes is the useful part: it was right
  on a measurement, and was declined because nobody had taken the measurement.
- `apps/web/.screenshots/m8-border.png` records the one place the border/bar shared value is visible,
  on a 3-activity fixture whose bars fill large fractions of the box — which §15.2 shows is not what a
  real plan looks like. Recorded as an observation rather than built around.
