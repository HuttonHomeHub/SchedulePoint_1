# ADR-0103 — Paper is a surface, and the exported diagram is the diagram

- **Status:** Accepted (W3-M1 and W3-M2 landed 2026-08-22)
- **Date:** 2026-08-22
- **Amends:** ADR-0055 §1 (the surface-scope vocabulary), ADR-0097 D1 (the rebound closure)
- **Builds on:** ADR-0026, ADR-0056, ADR-0059, ADR-0065, ADR-0093, ADR-0102
- **Closes:** `docs/TECH_DEBT.md` #163, #164 · **Opens:** #166, #167

## Context

Two defects, filed a day apart, turned out to be the same one seen from two ends.

**#158** found the exported and printed diagram resolving its ground from the app's live
`--background`, so the deliverable followed the screen's theme onto paper — under Graphite, a
near-black diagram panel inside white paper chrome. Fixing it produced three `--print-*` tokens.

**#163** then observed those three were not a pack but **a surface family truncated to three
members**, and this repository's own discriminator says so: _if the thing has a semantic sibling in
the base vocabulary, rebind it; if it does not, pack it._ Background / foreground / muted-foreground
have exact siblings. The shape is also, precisely, ADR-0055 §1's founding three-token header stub
one medium along — latent only while the print document rendered no `Badge` and no secondary text.

**#164** found the export dropping default-on layers. It was filed as two; enumerating both
compositions showed **seven**, because `TsldCanvas` builds 25 scene keys and the export built six.
Nobody had decided that: nine features each added correctly to the screen, and nobody re-read the
export. The seventh, `todayFraction`, was named in no document at all until a review — the screen
draws a fractional Today line with a pill, the deliverable drew a whole-day line with none.

The common cause is that **paper had no identity of its own**. It was whatever the screen was, minus
whatever nobody had wired up.

## Decisions

### D1 — Paper is a surface scope, not a pack

`[data-surface="print"]` joins `chrome`, `panel`, `brand`, `auth` and `canvas`: a fifth entry in
`FAMILIES`, a seventh in the contrast matrix's `SCOPES`. The family is complete at 31 members,
because ADR-0055 §1's rule is that a family is complete or it is a trap.

### D2 — A scope must govern a subtree, or it is a pack wearing a scope's name

The scope goes on the **one container** `lib/print-document.ts` mounts, shared by the TSLD print
surface and the Gantt programme, and the stylesheets read ordinary **semantic** names.

This is stated as a decision because it shipped wrong for one commit. The first version put the
attribute on a throwaway element for the image export while both stylesheets kept reading
`var(--print-*)` by raw name — 17 direct reads, zero semantic — so all 31 rebinds had no consumer
and the two DOM artefacts still consumed the family **as a pack**. That is #163's own diagnosis
reproduced one level up, by the commit closing it, and it was invisible because every value happened
to resolve the same either way.

### D3 — The family aliases `--page-*` by default and `--plot-*` only where the painter reads

Three members are **literal** — paper is light because it is _declared_ light, not because the
current theme agrees. Nine alias `--plot-*`. Nineteen alias `--page-*`.

The default is the page rather than the diagram because the scope's subtree includes the Gantt
programme's `<table>`: `--border`, `--muted` and `--accent` resolving to diagram values on a table
would be wrong. "Cannot drift from the screen" only ever applied to the painter's own members.

### D4 — Paper's polarity inversion is accepted, and gated in its accepted direction

On the screen the month band is _lighter_ than its ground; on true-white paper it is _darker_.
`--print` is `oklch(1 0 0)`, maximum lightness, so **nothing can be lighter than paper** and no
value could restore the screen's order. An alternating band carries no polarity meaning, and
light-grey bands on white is the printed convention, so the inversion is accepted.

It is asserted as a **chain** — `L(hatch) < L(wash) < L(band) < L(ground)` — because a lightness
**floor** cannot detect a flip: the band's luminance is 0.930 either way, so `> 0.5` passes in both.

The spec called this inversion "the strongest single argument for paper-derived values". It is not
an argument for them at all, since no paper value can fix it, and the same document had already
accepted it 250 lines earlier. Recorded because the correction matters more than the claim.

### D5 — The contrast sweep is three grounds, not one

The non-working wash paints **opaquely** over the month band, so a mark inside a weekend column sits
on neither paper nor the band. Measured rather than argued: moving `--plot-primary` to
`oklch(0.665)` gives **3.03:1 on paper and 2.83:1 on the band**, so a paper-only sweep passes exactly
the value a three-ground sweep fails.

### D6 — The values are gated, not changed

The plan proposed print-tuned values. Measured, neither move was warranted: the ordering already
held and every mark cleared its floor, worst case the on-schedule bar at 3.220:1 on the wash. The
band move would have been 25% weaker than what ships. So W3-M2 gates the shipped values.

### D7 — The recurrence gate is derived, never a list

`scene-parity.structural.test.ts` parses both scene compositions, computes `canvas − export`, and
asserts it equals a `SCREEN_ONLY` record carrying **a reason per entry**. A hard-coded roster beside
a vocabulary that grows is the ADR-0073 C4 defect — and a seventh key already existed to prove it.

Two properties are load-bearing and both were learnt by failing. It **refuses** rather than answers
when it cannot see its input: the first version assumed both files spelled the composition alike and
would have reported an empty canvas roster, i.e. green. And it strips comments **before** matching
braces: an unbalanced brace in a comment truncated the object, so a comment reading _"mirrors the }
that closes the band block"_ above a brand-new unexported key made every assertion pass. The gate
could be silenced, on the exact defect it exists to catch, by a comment.

### D8 — The deliverable is asserted by decoding the artefact

Every export unit suite runs in jsdom, where `getComputedStyle` yields nothing and the resolver
takes its fallbacks — so they exercise the branch that is correct and **can never reach the branch
that ships**. That is how seven layers went missing behind a green suite.

`apps/web/e2e-export/` presses the real menu item, catches the real download, decodes the PNG and
reads pixels back. **No stored golden**: the title band carries a generation date, and ADR-0058
records that a gate failing daily gets deleted rather than fixed, so it asserts _properties_.

Those properties are named, not counted. A count of "at least two light grounds" passes while
`monthBands` alone is missing, which is a restored layer absent behind a green assertion — the
defect this ADR exists for, inside its own gate.

## What is deliberately not decided

**#166** — a whole-plan export of a long programme loses weekends entirely, because wash and hatch
are one `fillStyle` culled below `NON_WORKING_MIN_PX`. It matters more on paper than on screen: a
sheet has no zoom, and the wash carries no colour signal there, so the hatch is the sole channel.

**#167** — five scene keys are **lens** state (Colour-by, over-allocation, baseline ghosts,
isolate/float-path dimming). A planner colouring by resource exports a criticality-coloured picture.
Whose picture the export is remains open, filed with the enumeration attached.

## Consequences

The CPM engine is not imported and no migration runs. The screen is byte-identical: W3-M1 was proven
inert at **zero differing pixels across 246,430** in two real exports captured minutes apart.

Every defect this ADR records was found by a review or an instrument, never by reading — and four of
them were in the gates rather than the product. The one lesson worth carrying: **a gate is an
artefact with its own defects, and the first thing to check about a new one is whether it can be
made to pass while the thing it guards is broken.**
