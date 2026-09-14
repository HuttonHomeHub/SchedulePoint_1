# M0 — Look at it, and measure

> **Status:** in progress — small-plan half complete (2026-09-14). The scale-plan half is
> seeding.
>
> This document is the epic's evidence base. The spec was written with `Bash` disabled, so
> **every figure in it is a file read or arithmetic** (`feature-spec.md` §0.1). Everything
> below was taken from a running browser against a running API.

## 0. What this run could and could not honour

**M0-T1 step 4 says "write the observation before reading §4", and I could not.** I wrote
the brief that produced the spec and read the spec to report it, so the pristine-eye
condition was spent before M0 existed. Recording it rather than pretending otherwise: the
observation in §2 is therefore weaker evidence than the task intended, and the numbers in
§3 — which are instrument readings, not impressions — carry the weight instead.

That is also why §2 is written as _"what the picture shows"_ rather than _"what is wrong
with it"_, and why the two findings §2 turns up that the spec does **not** contain (§2.3,
§2.4) matter more than the ones it confirms: those are the ones my prior reading could not
have planted.

## 1. Environment

|         |                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------- |
| Harness | `apps/web/scripts/shoot.mjs --only plan-workspace-minimap --width 1646`                              |
| Width   | **1646** CSS px — the product owner's Surface Pro (ADR-0091)                                         |
| Stack   | local Postgres 16 (`scripts/e2e-local.sh --db-only`), `nest start`, `pnpm dev`                       |
| Flags   | **shipped defaults** — deliberately not the base Playwright config, which pins editing flags off     |
| Plan    | the harness's own `seedProgramme` fixture — **10 activities, 6 critical**, span 05 Jan – 03 Mar 2026 |
| Build   | `web 0.128.0 · api 0.64.0` (read off the shell's own footer in the shot)                             |
| Image   | `apps/web/.screenshots/1646/plan-workspace-minimap.png` (git-ignored)                                |

**This is the SMALL plan.** The decimation case (2,160 activities) is a separate run and is
recorded separately; nothing in this half should be read as covering it.

## 2. What the picture shows

The minimap sits bottom-right over a canvas that is ~85 % empty, because the fixture's ten
activities occupy the top five lanes. It is a flat panel: a header reading **Overview** with
a close button, and below it a 200×120 picture showing a near-continuous red band across the
top and four blue blocks descending in a staircase.

### 2.1 The picture area is the same colour as the canvas it floats over — by construction

Sampled: minimap ground `rgb(239,241,244)`, canvas behind the panel `rgb(233,238,244)`.
**Contrast ratio 1.03:1.** The panel header is `rgb(237,239,242)`, so the whole widget —
header, picture, and the canvas behind it — is one flat wash, and the only thing separating
the picture from the page is a 1 px line.

This is not a drift or a token slip. `TsldCanvas.tsx:1917-1928` builds the minimap palette
with **`ground: palette.canvasGround`**, which is the correct token for _the diagram's own
ground_ and the wrong one for _a small inset picture floating over that same ground_: the two
are then necessarily identical. The defect is structural, and it is the reason the widget
reads as a hole in the panel rather than as a picture.

### 2.2 The boldest mark in the panel is the one carrying the least information

Measured contrast, minimap ground as the reference:

| Mark                                             | Sample            | Against ground |
| ------------------------------------------------ | ----------------- | -------------- |
| Viewport frame stroke                            | `rgb(29,34,41)`   | **14.13:1**    |
| Critical bar                                     | `rgb(156,7,17)`   | —              |
| Ordinary bar                                     | `rgb(86,146,205)` | —              |
| **critical vs ordinary**                         |                   | **2.61:1**     |
| **critical vs its 1.4.1 fringe** `rgb(51,51,51)` |                   | **1.48:1**     |

The frame is not faint — it is the loudest thing in the widget by a factor of five. **My
briefed hypothesis, that the indicator is hard to see because it is two hairlines, is
wrong and is withdrawn.** What is actually wrong is that at whole-plan zoom the rectangle is
congruent with the picture's own edge, so the loudest mark on screen is a border that
delimits _everything_ — indistinguishable from panel chrome, and carrying no information at
all in the state the fixture is in. Meanwhile the distinction the widget exists to convey,
critical against not, is running at 2.61:1.

**This changes why option 1 wins, not whether it wins.** A fill works because it makes the
_region_ legible; it does not work by making a faint line bolder, and a milestone that
thickened the stroke instead would have made the picture worse.

### 2.3 Near-critical has no minimap representation at all — NOT in the spec

The scene paints three bar states. Sampled from the same screenshot: critical
`rgb(156,7,17)`, ordinary `rgb(75,140,202)`, near-critical `rgb(159,86,0)` (A1210
"Attenuation crate install"). **The minimap paints two** — every non-critical bar is
`rgb(86,146,205)`.

Structural, and it is an omission rather than a collision: the five keys handed to
`buildMinimapBitmap` are `ground`/`bar`/`critical`/`outline`/`dataDate`
(`TsldCanvas.tsx:1921-1927`), and `palette.nearCritical` is not among them, so
`isNearCritical` activities fall through to `bar`.

This is a **different defect class from the two the spec found**. Those are two marks sharing
one token value; this is a scene state with no minimap mark of any kind. It belongs to M2
and the spec's §4.3 must be widened to hold it — recorded here rather than folded silently,
because the spec's collision table is stated as complete and is not.

Whether it should be **fixed** is a real question, not a foregone one: ADR-0100 D5's
decimation policy deliberately omits ten of the painter's layers, and near-critical may be
a legitimate omission rather than an oversight. What is not defensible is that no document
records the decision either way.

### 2.4 The 1.4.1 fringe fires here, and it is worth 1.48:1 — NOT in the spec

The spec predicts by arithmetic that the fringe never fires on either measured plan
(`laneCount ≤ 40` required). On this fixture it **does** fire — five lanes, 24 px rows — and
a vertical scan through a critical bar finds the fringe at `rgb(51,51,51)` against the bar's
`rgb(156,7,17)`: **1.48:1**.

So the fringe exists, is reachable, and is close to invisible. The spec treats the fringe as
an all-or-nothing question (does it fire?); the measurement says there is a second question
underneath it (is it worth anything when it does?), and on this evidence the answer is
barely. M2 owns it.

**A scanning artefact is recorded so nobody re-derives it as a finding.** The critical bar's
_top_ fringe reads `rgb(255,255,255)`, which is not the fringe: it is the viewport
rectangle's halo (`outline: 1px solid var(--color-canvas-minimap-frame-halo)` at
`outlineOffset: -2px`), which at whole-plan zoom lies exactly on the bar's top edge. The
bottom fringe at `rgb(51,51,51)` is the real one.

### 2.5 Two marks are absent from this shot, and that bounds what it proves

- **The data-date vertical** is at the plan start (data date 05 Jan 2026, plan starts
  05 Jan), so it renders at x≈0 underneath the frame. Present in the code, invisible here.
- **The today line** is correctly absent: today is 2026-09-14 and the plan spans Jan–Mar
  2026, so it is off-span.

**Consequence for M0-T4:** this shot therefore **cannot** test the `today`/`critical`
collision, because one of the two marks is not drawn. The file read stands
(`palette.ts:163,173` — both `--destructive`), and the live pixel proof is still owed. It
needs a plan whose span contains today.

## 3. Measured values

All sampled from `.screenshots/1646/plan-workspace-minimap.png` with Pillow; luminance by
the WCAG 2.x formula.

```
canvas behind panel   rgb(233,238,244)
panel header          rgb(237,239,242)
minimap ground        rgb(239,241,244)   ← identical to the scene's own ground
minimap critical      rgb(156,7,17)
minimap ordinary bar  rgb(86,146,205)
fringe (bottom edge)  rgb(51,51,51)
frame stroke          rgb(29,34,41)
frame halo            rgb(255,255,255)

minimap ground vs canvas behind panel   1.031:1
minimap ground vs frame stroke         14.13:1
minimap critical vs minimap bar         2.61:1
minimap critical vs its fringe          1.48:1
```

## 4. Reconciliation against the spec's §4.10

| Row                                                               | Fired?               |                                                                                                                                     |
| ----------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Viewport indicator already easy to find at 1646                   | **partly**           | It is easy to _see_ (14.13:1) and impossible to _identify_. Option 1 keeps rank 1; the **reason** in §4.1 is rewritten (§2.2).      |
| WBS summary bars dominate the picture                             | **not yet testable** | The fixture has no summaries. Owed by the scale run.                                                                                |
| Year bands at 17.7 px read as stripes competing with the bars     | **not yet testable** | Owed by M0-T3.                                                                                                                      |
| The picture is legible and the **panel** is what looks unfinished | **no**               | The panel is plain but coherent; the picture is the weaker half. Option 4 stays rank 4.                                             |
| The complaint is really about **size**                            | **no**               | At 200×120 the ten-activity fixture is perfectly legible. CQ-3 stays closed on this evidence; the scale run could still re-open it. |

**Nothing re-orders the epic on this half.** Two additions to M2's scope (§2.3, §2.4) and one
rewritten justification for M1 (§2.2).

## 5. M1's design, re-derived from the inks — and the instrument the spec prescribes cannot judge it

M1-T1 says to choose the fill's alpha from an assertion rather than by eye, and names the
assertion: composite the fill over `--primary` and over `--destructive` and check the pair
still clears the criticality floor (1.5:1, ADR-0097 Landing E). Computed against the inks
sampled in §3, **that constraint never binds and the instrument answers the wrong
question.**

### 5.1 The criticality risk M1-T1 is built around does not occur

Alpha-compositing a neutral dark fill over the two measured bar inks:

| alpha | critical vs ordinary, through the tint |
| ----- | -------------------------------------- |
| 0.10  | 2.495:1                                |
| 0.20  | 2.355:1                                |
| 0.30  | 2.187:1                                |
| 0.40  | 2.023:1                                |

The floor is **1.5**. It is not reached at any alpha a designer would use, so M1-T1's stated
risk — "the tint washes out the criticality distinction beneath it" — is **not the binding
constraint**. Keeping the assertion is still right (it is cheap and it pins a real property),
but a milestone that only had this assertion would have been free to pick any alpha at all.

### 5.2 The constraint that does bind is the opposite one, and the spec does not name it

What has to be true is that the **tinted region differs from the untinted region** — otherwise
the fill is decoration. On this ground that is hard in one direction and easy in the other:

| fill            | alpha for a 1.5:1 region floor | cost to criticality           |
| --------------- | ------------------------------ | ----------------------------- |
| neutral dark    | 0.21                           | 2.329:1 — fine                |
| primary blue    | 0.32                           | 2.476:1 — fine                |
| **brand amber** | **0.68**                       | **1.308:1 — below the floor** |

A **light** tint can never work: the ground is already `rgb(239,241,244)`, so lightening it
moves the ratio by almost nothing. By this instrument the answer is a dark neutral at
α≈0.21 — which is a design that **dims the region the reader is looking at**, the exact
objection §4.1 raises against the outside scrim, applied inwards.

### 5.3 …and then the instrument turns out to be wrong for the question

The old app's fill measures **1.073:1** against its own ground. On that number I wrote, in an
earlier draft of this document, that the old fill "did nothing" and that its indicator's
visibility was entirely its border. **That was wrong, and a second instrument says so:**

|                                    | contrast ratio | CIE76 ΔE |
| ---------------------------------- | -------------- | -------- |
| Old app's amber fill vs its ground | 1.073:1        | **8.33** |

ΔE 2.3 is a just-noticeable difference and 5 is unmistakable, so the old fill was **clearly
visible** — as a chroma shift on a neutral ground, which is a channel a luminance ratio is
blind to by construction. Contrast ratio is the right instrument for "can this be read
against that" and the wrong one for "can this tint be seen at all".

Measured with the right one, the design inverts:

| fill            | alpha for ΔE ≥ 5 | ratio (for reference) | criticality through it |
| --------------- | ---------------- | --------------------- | ---------------------- |
| **brand amber** | **0.06**         | 1.040:1               | **2.463:1**            |
| primary blue    | 0.09             | 1.119:1               | 2.644:1                |
| neutral dark    | 0.08             | 1.168:1               | 2.506:1                |

A hue-bearing tint at **α≈0.06** is unmistakable and costs criticality essentially nothing —
against α=0.21 of dark neutral, three and a half times the ink, to achieve a worse picture.
This is also what the old app did, and why it worked.

### 5.4 What this changes in M1-T1

The task gains a **second assertion using a second instrument**, and the two are not
interchangeable:

1. **ΔE(tinted ground, ground) ≥ 5** — the region is legible. New; the spec has nothing
   covering it, and without it the alpha is unconstrained from below.
2. **contrast(critical-through-tint, ordinary-through-tint) ≥ 1.5** — criticality survives.
   The spec's assertion, kept, now understood as a ceiling on alpha rather than the thing
   that picks it.

**Verified red is not optional for the first one**: a ΔE assertion written against a fill that
is already visible passes whatever the alpha, so it must be run against α small enough to
fail (α = 0.01 gives ΔE ≈ 0.9).

**One caveat is recorded rather than resolved.** ADR-0100 D9 contrast-gates the frame pair at
3:1 against `MINIMAP_GROUNDS`; brand amber is **1.918:1** on this ground and would fail that
gate as a _stroke_. Nothing here proposes changing the stroke — the fill is a separate
property with a separate justification — but a later milestone reaching for "make the frame
amber too" must clear D9 first, and on these numbers it cannot without the two-tone pair
carrying it on the halo.

## 6. M0-T4 — the collisions, proven live

§2.5 recorded that the fixture could not test the `today`/`critical` collision, because today
was off-span and one of the two marks was not drawn. A second plan was built for it: data date
2026-08-03, a six-link chain of 14-day activities running past today, three off-path bars.

### 6.1 The resolution happens where the code says it does

M0-T4's stated risk is the ADR-0102 one — a token can resolve somewhere other than where it
appears to. Read live off the element the painter asks:

```
resolvedFrom   canvas surface          ← NOT the documentElement fallback
--foreground   oklch(0.321 0 0)
--destructive  oklch(0.439 0.175 27)
--primary      oklch(0.624 0.115 249)
--warning      oklch(0.528 0.13 62)
--canvas       oklch(0.958 0.004 250)
--background   oklch(0.958 0.004 250)
```

So the ADR-0102 failure is **not present here**, and that is worth stating as a pass rather
than leaving unremarked. Two things follow directly:

- `today` and `critical` are both `token('--destructive')`, and `--destructive` has **one**
  value — so they are the same colour by construction, now confirmed rather than inferred.
- `outline` and `dataDate` are both `token('--foreground')`, likewise.
- `--canvas` and `--background` are **the same value**, which is §2.1 seen from the token side:
  the minimap's ground is the page's background, so the picture cannot differ from the page.

### 6.2 The Today marker's computed colour, and the pixels underneath it

```
minimap rect box    {x:1433, y:816, w:200, h:120}
minimap canvas box  {x:1433, y:816, w:200, h:120}   ← congruent, measured live
Today marker        present, {x:1506.45, y:816, w:1, h:120}
Today computed bg   oklch(0.439 0.175 27)           ← exactly --destructive
```

The congruence in the first two lines is §2.2 measured rather than inferred from a screenshot:
at whole-plan zoom the viewport indicator **is** the picture's edge, to the pixel.

Sampling the Today column against its neighbour settles the collision:

```
        x=1504 (beside)      x=1506 (on the line)
y=818   (156,7,17)           (156,7,17)     ← inside a critical bar
y=842   (156,7,17)           (156,7,17)     ← inside a critical bar
y=850   (239,241,244)        (156,7,17)     ← over empty ground
y=930   (239,241,244)        (156,7,17)     ← over empty ground
```

The Today line over ground is `rgb(156,7,17)` — **byte-identical to the critical bar**. The
file read is now a live read, and M0-T4 is discharged.

### 6.3 The consequence is sharper than "two marks share a token"

The rows above are the whole finding in four lines: where the Today line crosses **empty
ground** it is legible, and where it crosses a **critical bar** it vanishes completely — same
red, no fringe, no dash, nothing. So the marker that says _where we are now_ is invisible on
exactly the rows a planner cares most about, and on a real programme the critical path is
where most of the ink is.

That is a stronger statement than the spec's, which frames the defect as a registry problem
(two entries, one value). It is a **legibility** problem with a worst case, and the worst case
is the common case. M2 owns it, and its acceptance condition should be stated as _the Today
marker is distinguishable where it crosses a critical bar_ rather than as _the two tokens
differ_ — the second is satisfiable by a change that still leaves them close.

## 7. M0-T3 — the legibility floor, set from images

M0-T3 forbids setting the tier-admission floor by argument, and forbids inheriting
`DAY_GRID_MIN_PX`. Six candidate pitches were rendered into the **real** 200×120 box with the
**real** inks (`--canvas` ground, `--canvas-grid-month`, `--canvas-grid-year`, and the two bar
values sampled in §3), twice each — rules alone, and rules beneath a 24-lane bar field.

Artefacts: `apps/web/.screenshots/m0-pitch-ladder.png` (all six, both rows).

| pitch       | rules alone                                              | with bars                                     |
| ----------- | -------------------------------------------------------- | --------------------------------------------- |
| **1.5 px**  | a solid grey wash — not rules, a tone                    | actively fights the bars                      |
| **3 px**    | reads as a hatch                                         | noisy                                         |
| **4.5 px**  | rules crowd; gaps narrower than the apparent line weight | the ground is visibly striped                 |
| **6 px**    | rules read as individual structure                       | acceptable; the ground is calm                |
| **8 px**    | clean and quiet                                          | clean                                         |
| **17.7 px** | obviously structural                                     | excellent — background structure, bars on top |

**The floor is 6 px**, because that is the lowest pitch at which the rules stop reading as a
texture and start reading as individual structure. The transition is between 4.5 and 6 and it
is not subtle at 3× magnification; 8 is calmer still but buys nothing the measured plans can
use (see below).

### 7.1 A coincidence recorded as a coincidence, not as the derivation

The scene's own day-tier floor is **also 6** (`paint.ts:103`). That is corroboration and is
explicitly **not** where this number comes from: its docblock gives a reason ("else a solid
block") and cites no measurement, so deriving from it would be inheriting an unmeasured
constant — which is precisely what M0-T3's risk clause forbids. The agreement is worth noting
because it supports the spec's own insight that **the rule is a pitch ladder, not a tier
name**: a 1 px vertical rule is legible or not at a given pitch regardless of which tier it
belongs to or which canvas it is on.

### 7.2 What the floor admits, and the honest caveat

Against the spec's §3.3 span figures — **still to be confirmed by M0-T2, and flagged as
inherited arithmetic until then**:

| plan                       | month  | quarter | year    | admitted at a floor of 6 |
| -------------------------- | ------ | ------- | ------- | ------------------------ |
| 540 activities (1,059 d)   | 5.7 px | 17.2 px | 69.0 px | **quarter + year**       |
| 2,160 activities (4,125 d) | 1.5 px | 4.4 px  | 17.7 px | **year only**            |

So the ladder is quiet on both: two tiers on the shorter plan, one on the longer. **Month
rules are admitted on neither**, which is the spec's §3.3 conclusion reached again by a
different route — it argued from ink coverage, this argues from an image.

**The caveat is that the choice between 6 and 8 is currently unobservable.** Neither admits
month on either measured plan (5.7 and 1.5 are below both), and both admit quarter at 17.2 and
year at 69.0 and 17.7. A plan whose month pitch lands between 6 and 8 — a span of roughly
760–1,015 days at 200 px — is where they would differ, and no such plan has been measured. The
floor is therefore set from the images on its own merits rather than from a case that
discriminates, and that is stated so a later reader does not mistake it for a tuned number.
