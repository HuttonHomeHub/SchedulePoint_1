# M0-T4 — The contrast ceiling question, answered

**No gate is built.** The deliverable is the arithmetic that disqualifies the instrument, the
withdrawal of both candidates, and the closure of `docs/TECH_DEBT.md` #157 as _answered_ rather than
as _done_.

## What #157 asked

`token-contrast.test.ts` asserts `>= 3:1` and `>= 4.5:1` across the matrix and nothing anywhere
asserts that a pair is not too **far** apart. The consequence is one-directional drift: every fix in
this register's history moved a value toward a floor from below, and the pair a planner reads all day
— page foreground on the canvas ground — sat unquestioned at 14.61:1, more than triple AA and more
than double AAA. ADR-0101 softened it to 10.84:1 as a labelled stopgap and deferred the instrument
here.

## The four figures

Computed with the repository's own `parseColour` / `relativeLuminance` from `@/test/colour` — the
same functions `token-contrast.test.ts` uses, so this is the gate's arithmetic and not a second
opinion.

| Pair                                                                                 | Ratio       |
| ------------------------------------------------------------------------------------ | ----------- |
| Dark ground `oklch(0.177 0.011 260.6)` vs `--page-foreground` **before** the stopgap | **14.61:1** |
| Same, **after** ADR-0101's stopgap                                                   | **10.84:1** |
| Recovered `.corporate` page body — `oklch(0.982 0.002 248)` / `oklch(0.321 0 0)`     | **12.00:1** |
| Recovered `.corporate` card body — `oklch(1 0 0)` / `oklch(0.321 0 0)`               | **12.64:1** |

`--page-background` and `--canvas` hold the same literal today, so the page and the diagram share a
ground and one figure covers both.

## The window arithmetic, which is the whole answer

A ratio ceiling has to satisfy two constraints at once:

- To have **caught** the defect, it must sit **below 14.61**.
- To avoid **rejecting** the recovered light palette — an ordinary, comfortable near-`#333`-on-white
  value that nobody would call a defect — it must sit **above 12.64**.

The entire admissible window is **under two points wide**, and it would be tuned to exactly two data
points. That is not a gate; it is a number chosen to separate one known-bad value from one known-good
one, which will classify the third value it meets by accident.

Worse, inside that window the rule enforces the wrong thing. **What made 14.61:1 uncomfortable was
not the ratio — it was halation**, the bloom of light ink on a dark ground, which is a property of
the _polarity_ and not of the _separation_. A ceiling expressed as a ratio cannot see polarity, so on
a light ground it would be policing a phenomenon that does not occur there. The instrument and the
defect are not the same shape.

## The second candidate, withdrawn

A **ground-luminance band** — "a surface is off-white, never paper-white" — sounds more principled
because it names a property of the ground rather than of a pair. It **fails on day one** against the
recovered palette's own `--card: oklch(1 0 0)`, L = 1.000, paper-white by construction and correct:
a white card on an off-white page is the figure/ground separation the whole light theme rests on.

A gate that fails on the values it is written to protect gets deleted rather than fixed, which is
ADR-0058's rule and the reason the coverage ratchets were set at the measured floor rather than the
aspirational one. Withdrawn before writing, and recorded as withdrawn so it is not re-proposed.

## What actually replaces the gate

Nothing automatic, and that is the honest answer. What removes the defect is the **ground flip
itself**: the light theme retires the dark ground, and with it the only condition under which
halation occurs. The surviving risk on a light ground is the **opposite** one — washed-out,
insufficiently separated values — and the existing floors already catch that, which is why they exist
and why they have caught things.

The two stopgaps ADR-0101 landed (`--page-foreground` at 0.82, `--canvas-nonworking-hatch` at 0.25)
are **not** carried forward. They are labelled in `globals.css` as measures the light theme replaces,
and M1/M2 re-derive both from the recovered derivation rather than inheriting a softened dark number.

## If a dark theme ever returns

This paragraph is #157's surviving requirement, moved here and into the ADR so the knowledge outlives
the register row:

> A dark theme's body-text pair needs a **polarity-aware** comfort check, not a ratio ceiling. The
> quantity to bound is light-ink-on-dark-ground separation specifically — and the useful lever is
> more likely to be reducing the ink's lightness than raising the ground's, because the ground
> carries the diagram and the ink does not. 14.61:1 is the recorded value that was too much;
> ADR-0101 moved it to 10.84:1 without complaint, so the comfortable range starts somewhere below
> the former and at or above the latter. That is two data points and it is not enough to set a
> number — it is enough to know what to measure.
