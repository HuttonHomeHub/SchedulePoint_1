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

## 8. M0-T5 — the baseline M5 will re-derive

### 8.1 Today's asserted counts, verbatim

From `apps/web/src/features/tsld/render/minimap-budget.test.ts`, so M5 compares against what
was actually asserted rather than against a remembered shape:

| case                                   | assertion                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 2,000 activities                       | `fillRect === 1 + 2000 + 1`; `fillText === 0`; `measureText === 0`; `strokeRect === 0`                            |
| 2,000 activities                       | `styleWrites === 4` (ground + two bar passes + data-date)                                                         |
| fringed plan (8 lanes, 100 activities) | `fillRect === 1 + (100 − critical) + critical × 2 + 1`; `styleWrites === 5`; `strokeRect === 0`; `fillText === 0` |
| empty plan                             | `fillRect === 1`; `styleWrites === 1`                                                                             |

**One live defect in that file is recorded here rather than fixed** (it belongs to M3): the
third case's comment at `:107` says _"6 style writes"_ while the assertion at `:127` correctly
expects **5**. The assertion is right and the prose is wrong; M3-T3 corrects the name, never
the number.

### 8.2 Rebuild cost, measured against the shipped painter

`buildMinimapBitmap` imported through the dev server's own module graph — so the code measured
is the code that ships — into a real `<canvas>` in Chromium. 20 warm-up builds, then 200
samples.

| scene                        | p50        | p95         | max     |
| ---------------------------- | ---------- | ----------- | ------- |
| 500 activities / 60 lanes    | **0.9 ms** | **1.6 ms**  | 13.7 ms |
| 2,160 activities / 274 lanes | **3.9 ms** | **13.2 ms** | 14.7 ms |

Environment: `HeadlessChrome/141` on X11 Linux, `devicePixelRatio 1`, software-rasterised —
the same class of environment as the v1 figure, which is what makes the two comparable at all.

### 8.3 The p95 disagrees with v1 and the honest reading is interference, not regression

v1 recorded p50 3.4 / p95 5.1 / max 9.2 at 2,160. This run agrees closely on **p50** (3.9 vs
3.4, +15 %) and diverges sharply on **p95** (13.2 vs 5.1, +159 %).

**A 2.6× tail under a 1.15× median is the signature of interference rather than of slower
code** — slower code moves the median. The confound is named rather than assumed: this ran
while a 2,160-activity plan was seeding through the local API into the local Postgres on the
same machine. Load average at the time was **0.93**, so one core busy — a real confound, and a
moderate one rather than saturation, which is stated in both directions rather than used to
excuse the number.

**This figure is therefore PROVISIONAL and is to be re-run clean before M3 relies on it.** The
v1 number is not treated as the truth either: it carries its own stated deviation, and neither
run has a repeat-measurement spread, which ADR-0128 makes the thing that turns a reading into a
verdict.

### 8.4 M3's falsification bar, committed before M3 runs

Per ADR-0128's method, written now rather than after the result is known:

> **M3 passes if the rebuild stays within one order of magnitude of the clean baseline, and
> the per-frame path is unchanged.** The second limb is the one that matters and it is
> structural, not statistical: the tiers are drawn inside `buildMinimapBitmap`, which runs on
> scene change only, so a regression that moved work onto the frame loop would show up as a
> changed call site rather than a changed millisecond. A gate that only measured milliseconds
> could pass while the picture was rebuilt every frame — which is exactly what
> `minimap-budget.test.ts`'s own docblock says it structurally cannot catch.

## 9. The scale plan — M0-T2, and §4.10 row 2 firing

### 9.1 The fixture, and what is not canonical about it

A 2,160-activity scale plan seeded through the **public REST API** (`schedulepoint-seed --tier
scale --activities 2000`, ADR-0066). Two departures are recorded rather than glossed:

- **2,811 of roughly 3,200 links** — the seeder was killed by my own 50-minute timeout at 88 %
  complete. The plan was recalculated and measured as it stands.
- **Lanes were packed by calling the shipped `packLanes` from `@repo/layout` and writing
  `lane_index` with one SQL statement**, not through Auto-arrange. The packing is therefore
  exactly what the product computes — same function, the one Auto-arrange and the interchange
  commit both call — and only the transport differs. Said out loud per ADR-0081's rule that a
  harness names where it goes round the product. (Auto-arrange was tried first through the UI
  and moved nothing; that is not diagnosed here and is **not** claimed as a defect.)

### 9.2 M0-T2 — the spec's arithmetic holds

Measured live off the recalculated plan:

|                      | measured     | spec §3.3 (arithmetic) |
| -------------------- | ------------ | ---------------------- |
| span                 | **4,385 d**  | 4,125 d                |
| month pitch @ 200 px | **1.39 px**  | 1.5 px                 |
| quarter pitch        | **4.16 px**  | 4.4 px                 |
| year pitch           | **16.66 px** | 17.7 px                |
| lanes                | **178**      | 274                    |
| px per lane          | **0.674**    | —                      |
| recalculate          | 625 ms       | —                      |

**The spec's table is confirmed to within ~8 %** and its conclusion is unchanged: at the
M0-T3 floor of 6 px, month and quarter are refused and only the **year** tier is admitted.
`pxPerLane` of 0.674 is far below `CRITICAL_FRINGE_MIN_H = 3`, so the 1.4.1 fringe **cannot**
fire here — the spec's prediction for the large plan, now measured.

### 9.3 §4.10 row 2 FIRES — and not in the shape the spec predicted

> **CORRECTION, 2026-09-14, before any code was written on it.** §9.3 and §9.4 as first written
> are **wrong about the mechanism and wrong about what is on screen**, and §10 replaces them.
> They are kept rather than rewritten because the error is the instructive part: the numbers
> below were all correctly measured and the sentence built on them was not checked. Read §10
> before acting on anything here.

The spec's row reads _"WBS summary bars dominate the picture"_ and anticipated ink. They
dominate something worse: **the lane axis**.

```
lanes 0–8      1,989 activities   (92 % of the plan)
lanes 9–177      171 activities   ~1 per lane
```

and by type, lanes 9–177 hold **151 WBS summaries**, 14 Level-of-Effort bars and 6 tasks.
TASK's mean lane is **2.4**; WBS_SUMMARY's is **79.5**.

The picture that produces, measured row by row over the 200×120 box:

```
rows 0–16     dense (200, 200, 149, …, 156 inked px)
rows 18–108   exactly 2 inked pixels per row — and BOTH are chrome
              (the Today line and the viewport rectangle's edge)
rows 110–119  rising again to 182
```

**Only 18 of 120 rows carry 10 or more inked pixels.** 90 rows — three-quarters of the box —
contain no bar at all. So 174 rollup bars consume 94 % of the minimap's height and compress
1,910 tasks, which is the actual work, into the top 5 %.

### 9.4 It is structural, not an artefact of this fixture

A `WBS_SUMMARY` spans its entire subtree by definition, so it overlaps every activity beneath
it, and `packLanes` opens a lane whenever no existing lane's last finish is strictly before an
item's start. A summary can therefore almost never share a lane with its own children:
**the number of summary lanes tracks the number of summaries.** Any plan with a WBS has this
shape, and a deeper WBS has it worse.

The partial link graph (§9.1) is a real caveat for the **task** side — fewer links means fewer
chains and possibly more task lanes — and it is **not** a caveat for the summary side, which
does not depend on link count at all.

### 9.5 The WBS band does not reach the minimap

ADR-0063 exists to lift summaries out of the scene, so it is the obvious existing remedy.
Measured: toggling **WBS band** on changes **18.97 % of the screen** and leaves the minimap
region **byte-identical** (`ImageChops.difference(...).getbbox() is None`).

So the mechanism that removes summaries from the diagram does not remove them from the
overview of that diagram — and the band is default-off anyway (`TsldPanel.tsx:1064`,
`wbsBand ?? false`), so the default case is the bad case either way.

**The non-vacuity check is why that sentence is worth anything.** A byte-identical minimap is
also what a toggle that did nothing would produce, and on the first attempt that is exactly
what happened: the locator `/wbs|band/i` matched **"Month bands"**, which precedes "WBS band"
in the panel. The scene changed, the minimap did not, and the false finding was one paragraph
from being written. It was caught by dumping the panel's accessibility tree and reading the
sixteen names, and the run above pairs "the minimap did not change" with "19 % of the screen
did" for exactly that reason. ADR-0091 #199's rule — locate a control by its id, never by its
copy — one panel along.

### 9.6 §4.10 row 1 is plan-dependent, which changes how M1 is justified

On the small fixture the viewport rectangle is congruent with the picture's edge (§2.2, §6.2).
On this plan it is a legible rectangle covering roughly 78 % of the width and 14 % of the
height, clearly distinguishable from the panel. **So the congruence is the worst case, not the
general one**, and M1's justification is "the indicator must read as a region at every zoom",
not "the indicator is invisible" — which was already withdrawn once in §2.2 and is now bounded
from the other side as well.

### 9.7 What this re-orders

Per §4.10, a fired row re-orders the epic. Options for the summary problem, with the one I
recommend first:

1. **Omit `WBS_SUMMARY` (and `LEVEL_OF_EFFORT`) from the minimap bitmap.** A summary's extent
   is the union of its children's extents, all of which are already drawn, so omitting it
   removes **no information from the picture** while returning 94 % of the height to the work.
   It is the ADR-0100 D5 decimation argument applied to one more layer, and D5 already omits
   ten of fifteen. Measured effect: 178 lanes → ~9.
2. Draw them but exclude them from the lane extent — keeps the ink, keeps most of the
   compression, and makes the y axis no longer mean "lane", which is worse than either.
3. Make the minimap follow the WBS band toggle — leaves the default case broken, since the
   band is default-off.
4. Do nothing — the picture stays 75 % empty on every plan with a WBS.

**This is a design decision and not a measurement, so it goes to the product owner** rather
than being folded silently. Everything in M1 is unaffected by the answer: the viewport fill is
rank 1 under every option above.

## 10. The §9.3 correction — what those 174 bars actually are

**§9.3 says "174 rollup bars consume 94 % of the minimap's height". Both halves are false.**
Found by pursuing an inconsistency in my own document rather than by anything failing: §9.3
reported 151 summaries in lanes 9–177, and the row histogram in the same section reported the
middle 90 rows carrying **two** inked pixels, both chrome. 151 wide bars and 2 pixels cannot
both be true, and I published the pair without noticing.

### 10.1 What settled it

Four steps, each ruling out a hypothesis rather than confirming one:

1. **The painter in isolation** — fed a synthetic 178-lane set, it emitted 15 `fillRect`s per
   y-decile down to y = 119. So the painter is not the filter.
2. **The live scene** — temporary instrumentation inside `buildMinimapBitmap` on the running
   page logged `activities: 2160, rects: 2160`, `maxLane: 177`, and a y-histogram of **15 rects
   per decile**. So the scene is not filtered either: the bars ARE being drawn.
3. **Their geometry** — the same instrumentation printed the first six rects above y = 10:
   `{x: 0, y: 10.11, w: 1, h: 1}`, `{x: 0, y: 10.79, w: 1, h: 1}`, and so on. **One pixel wide,
   at x = 0.**
4. **The data** — every one of the 160 `WBS_SUMMARY` rows has `early_finish = early_start`.
   Mean span **0.0 days**.

### 10.2 So the picture is this

The summaries are **zero-span**. They paint as 1 px dots at day 0 — and the **data-date
vertical is drawn last, at day 0, full height, and paints straight over every one of them**.
They are not invisible because they are small; they are invisible because a later layer covers
them. That is why the middle rows measured as exact ground plus one data-date pixel: `199 + 1`,
with no blending anywhere, which is what "overwritten" looks like and what "too small to see"
does not.

The bottom band, meanwhile, is real and is **not** summaries: the 14 `LEVEL_OF_EFFORT` rows
have a mean span of **2,117 days**, so they are the only wide bars in the high lanes.

### 10.3 What survives, what is withdrawn, and what is now untested

**Survives, unchanged:**

- Every measured number in §9.2 (span, pitch, lanes) and §9.5.
- **The WBS band does not reach the minimap** — 18.97 % of the screen changes, the minimap is
  byte-identical. Independent of all of this.
- The picture is mostly empty at scale: 18 of 120 rows carry ≥ 10 inked pixels.
- Summaries do inflate the **lane count** — 160 of them hold 151 lanes.

**Withdrawn:**

- "174 rollup bars consume 94 % of the minimap's height." They consume 94 % of the lane
  **axis** while drawing **nothing a reader can see**.
- §9.4's mechanism — _"a summary spans its entire subtree, so it overlaps every activity beneath
  it, and `packLanes` must open a lane"_ — is **not what happened here**. These summaries span
  nothing; they all start and end at day 0, so they collide **at a point**, and `packLanes`
  opens a lane for each because no lane is free at day 0. The conclusion was right and the
  reason was invented.
- §9.4's claim that the partial link graph "is a real caveat for the task side and none at all
  for the summary side" is **exactly backwards**. A summary's lane is link-independent; its
  **span** is not, and the span is what makes these ones degenerate.

**Now untested:** whether a summary that really does roll up a subtree still forces its own
lane. It should — it would then overlap its own children — but this fixture cannot show it, and
nothing here should be read as having shown it.

### 10.4 This changes the approved action, and that must go back to the product owner

The product owner approved **omit `WBS_SUMMARY` and `LEVEL_OF_EFFORT` from the minimap
bitmap**, on §9.3's account. Against the corrected picture, implemented literally, it would:

- remove 160 dots **nobody can see** (they are already painted over) — no visual change;
- remove the 14 LOE bars, which **are** visible and are the bottom band;
- and leave the compression **essentially intact**. `worldExtent` takes `maxLane` from whatever
  it is given, and 6 ordinary **tasks** sit at lanes up to **163**, so dropping summaries and
  LOE moves the lane count 178 → **164**, not 178 → 9. `pxPerLane` goes 0.674 → 0.73.

So the action removes the one thing in that region a reader can see and does not fix what it
was approved to fix. **It is not built.** The decision goes back with these numbers.

### 10.5 A real, general defect found on the way — and it is not about summaries

**The data-date vertical overwrites any zero-duration activity sitting at the data date.** It is
drawn last, 1 px wide, full height, at day 0; a milestone is zero-duration by definition, and
this plan holds **42 `START_MILESTONE` and 34 `FINISH_MILESTONE`**, all zero-span. Any of them
landing on the data date is painted out of the picture entirely.

That is a genuine minimap defect, independent of the WBS question, and it belongs to M2 — whose
subject is exactly "five marks, five appearances". ADR-0100 D5 says **paint order IS the
decimation policy**, and this is that policy having an unintended consequence its own ADR does
not mention: the data date was put last so it survives the merge, and the cost is that it
silently removes whatever sits under it.

## 11. M2's dispositions — including the two it declines

M2's subject is "five marks, five appearances". Two of the three collisions it inherited are
fixed; the third is **declined on inspection**, and one new defect is **recorded rather than
fixed** because the fix is a decision this epic has no mandate for.

### 11.1 Fixed — the Today marker (the real one)

`today` and `critical` are both `--destructive`, proven live in §6, and the consequence is that
the marker vanishes wherever it crosses a critical bar. It now carries a `box-shadow` halo — the
`--canvas-minimap-frame` pair's answer to the same problem one element over — so the hue stays
the scene's (ADR-0059: two views of one plan do not disagree about what a thing looks like) and
legibility is bought with a second channel instead.

`box-shadow` rather than `outline` because the viewport rectangle beside it already uses
`outline` for its own halo, and two meanings for one property on sibling nodes is how the next
reader gets it wrong. Gated by a new `MINIMAP_GROUNDS` sweep, **verified red** by pointing the
halo at `--destructive`: 2.4:1 on both bar grounds.

### 11.2 Fixed — near-critical had no mark at all

Not a collision: a scene state with **no minimap representation**. A third batched pass, drawn
between ordinary and critical so the ladder paints in ascending urgency and the most urgent
still survives the 1 px merge (ADR-0100 D5's rule, extended rather than amended).

**Guarded, and the guard is the point.** A plan with no near-critical activity pays exactly what
it paid before, so all four existing budget assertions still expect **4** style writes and are
untouched. Unguarded they would have had to move to 5 for a pass drawing zero rects — a gate
loosened to accommodate a feature rather than a cost the feature has. Two new cases assert both
sides, the second **verified red** against the pre-change painter.

### 11.3 DECLINED — the fringe/dataDate "collision" is not a legibility defect

§6.1 records that `outline` (the critical fringe) and `dataDate` are both `--foreground`, and the
spec's table lists it beside the Today one. **On inspection they are not comparable defects and
this one needs no change.**

The Today case is identity on a ground where the mark must be read: same colour, and the marker
disappears. The fringe case is two dark 1 px marks that are never a choice a reader has to make —
the fringe is bounded to a bar and reads as that bar's edge, the data date is a continuous
full-height vertical, and the two are distinguished by extent before colour is consulted. On top
of that, `pxPerLane` is below `CRITICAL_FRINGE_MIN_H` on any large plan (0.674 measured, §9.2),
so on the plans where this would matter **the fringe is not drawn at all**.

Recorded as a decline with the reason rather than fixed, because this register has overstated a
citation once (ADR-0082) and inventing a change to match a table is the same error in the other
direction.

### 11.4 RECORDED, not fixed — the data-date vertical paints over what sits under it

§10.5's finding: the data date is drawn **last**, 1 px wide, full height, at day 0, so any
zero-duration activity starting on the data date is painted out. A milestone is zero-duration by
definition; the measured plan holds **42 `START_MILESTONE` and 34 `FINISH_MILESTONE`**.

It is not fixed here because every available fix is a **decimation-policy decision**, which is
ADR-0100 D5's territory rather than a defect repair:

- draw the data date **first** — the bars then win, and a dense plan hides the data date, which
  inverts the problem rather than solving it;
- **nudge** a zero-width bar clear of the line — at 0.0456 px/day that is a lie about position
  worth roughly 22 days;
- **accept it** and say so — defensible (one global fact beats one bar, and the activity is
  reachable on every other surface), but it should be a stated decision rather than an emergent
  one.

There is no free fix at 1 px: two marks cannot share a pixel. The choice belongs with the lane-
compression question in §10.4, since both are "what should the minimap draw" rather than "is this
drawn correctly", and both should be answered together.

## 12. The clean baseline — and §8.3's diagnosis was wrong

M3's falsification bar (§8.4) was committed before the milestone, so the baseline had to be
re-taken on an idle machine. Taken 2026-09-14 ~16:48, load average **0.31** (against 0.93 for
the contaminated run), each scene measured **twice** so the run reports its own spread — which
ADR-0128 makes the thing that turns a reading into a verdict.

| scene                        | p50       | p95             | max         |
| ---------------------------- | --------- | --------------- | ----------- |
| 500 activities / 60 lanes    | 0.9 / 0.9 | 1.5 / 1.5       | 12.2 / 12.3 |
| 2,160 activities / 274 lanes | 3.9 / 3.8 | **13.6 / 13.9** | 17.2 / 18.8 |

**Run-to-run spread: 0.0–0.1 ms on p50, 0.0–0.3 ms on p95.**

### 12.1 The correction

§8.3 read the p95's divergence from v1 (13.2 against 5.1) as **interference rather than
regression**, on the reasoning that a 2.6× tail under a 1.15× median is what contention looks
like and slower code moves the median. The clean run **reproduces the tail**: 13.6 and 13.9
against the contaminated 13.2, with a 0.3 ms spread between repeats. So the figure was never
contention, and the argument — which is sound in general — was applied to a case it did not fit.

I named the confound, measured it, and still drew the wrong conclusion from it, because I
treated a plausible mechanism as an explanation without taking the one measurement that
discriminates. The repeat is that measurement and it cost ninety seconds.

### 12.2 What the divergence from v1 actually is — recorded as unattributed

Not diagnosed, and deliberately not guessed at. The candidates are a **different machine**
(v1's figure is from another container on another date), a **different scene** (v1's generator
is not recorded here), and a **real change in the painter** across the epics since. Two things
bound it:

- **It is not M2.** The contaminated pre-M2 run measured 13.2 and this post-M2 run 13.6/13.9 —
  a delta inside twice the spread, on a fixture where M2's pass is guarded off (`plan()` sets
  `isNearCritical: false` throughout), so all M2 adds is one `rects.some()` scan.
- **Neither v1's figure nor the contaminated one carries a spread.** Mine does. That is the
  only reason this paragraph can say anything at all, and it is the argument for taking repeats
  by default rather than when a number looks surprising.

### 12.3 The bar M3 is judged against

§8.4 stands unchanged and is now anchored to a clean number: **the rebuild stays within one
order of magnitude of 13.6–13.9 ms p95 at 2,160 activities, and the per-frame path is
unchanged.** The second limb remains the load-bearing one and is structural rather than
statistical — the tiers draw inside `buildMinimapBitmap`, which runs on scene change only, so a
regression that moved work onto the frame loop shows up as a changed call site rather than as a
changed millisecond.

## 13. M4 — what the shipped picture measures, and what M4 did NOT change

Re-shot at 1646 with M1–M3 landed, against the same fixture as §2. The whole-picture colour
inventory, by area:

| ink                | px     | what                    |
| ------------------ | ------ | ----------------------- |
| `rgb(222,225,227)` | 15,382 | the tinted ground       |
| `rgb(145,9,18)`    | 3,717  | critical                |
| `rgb(148,82,3)`    | 2,256  | **near-critical (M2)**  |
| `rgb(71,132,189)`  | 696    | ordinary                |
| `rgb(29,34,41)`    | 636    | frame stroke            |
| `rgb(255,255,255)` | 628    | frame halo              |
| `rgb(49,50,50)`    | 177    | the data date           |
| `rgb(107,112,119)` | 166    | **the month tier (M3)** |

**Eight distinct marks where §2 measured five**, and the ground is no longer the canvas: it
reads **ΔE 5.01** against the canvas behind the panel, which is the M1 gate's floor confirmed in
a real browser rather than in arithmetic. Its contrast ratio is **1.126:1** — the number that
would have called it invisible, which is §5.3's argument standing up to a photograph.

The ladder as shipped, through the tint: critical vs ordinary **2.36:1**, critical vs
near-critical **1.54:1**, near-critical vs ordinary **1.53:1**, month rule vs ground **3.80:1**,
data date vs ground **9.79:1**.

### 13.1 The measurement found a gap in my own M1 gate

Two of those pairs sit **three hundredths above the 1.5 floor**, and `CRITICALITY_PAIRS` asserts
the ladder **untinted**. M1's composite assertion covered one pair — and worse, it was written as
an `it.each` over two grounds whose body **ignored the parameter** and computed the same pair
both times, so it read as two assertions and was one. It also predated M2, which added the third
bar state, so neither `--warning` pair was composited by anything.

Widened at M4 to sweep `CRITICALITY_PAIRS` itself — reused rather than restated, so a fourth bar
state is covered the day it joins that list. **Verified red** by raising the fill to 55 %: the two
failures are precisely the two pairs the old assertion could not see (1.32:1 and 1.27:1).

This is the register's own favourite shape — one correct pattern applied to a control and not its
neighbour — found in code I had written two milestones earlier, by measuring the shipped render
rather than by re-reading the test.

### 13.2 M4-T1 — chrome: NO CHANGE, and the reason

§4.10's fourth row asked whether the **panel** is what looks unfinished, and §4 answered no: the
panel is plain but coherent, and the picture was the weaker half. The picture is now fixed, and
the re-shot panel does not read as the weak part beside it. The plan's own risk note for this
task says the win "must be **seen**, not copied" — it is not seen, so nothing is changed.
Recorded as a decision rather than left as silence.

### 13.3 M4-T2 — `docs/TECH_DEBT.md` #155.3 re-filed, not folded in

Its condition is _"if it ever surfaces in use"_ and it has not: every screenshot this epic took
had computed dates, so the empty state was never reached. The epic was one milestone away and
touching the same component, which is exactly when a nearby deferral gets folded in; it stays
deferred because its trigger is a fact about **use**, not about proximity.

### 13.4 M4-T3 — CQ-3 answered: the panel size is unchanged

`MINIMAP_BOX` stays 200×120. Recorded as **asked and answered** rather than left implicit —
that figure was on record as "the probed working figure … **not a decision**" for a year and
nobody revisited it, which is how it became a question this epic had to ask. Changing it would
invalidate §7's pitch ladder, §9.2's measured pitches and §12's cost baseline, all of which are
derived at 200 px; the answer buys nothing the epic's other milestones have not already bought.

### 13.5 Closed: #155.1

The drag affordance was cursor-only, and that item **named the remedy**: _"corner ticks or a
faint fill are the shape."_ First-contact feedback arrived, the fill is the fill it named, and the
rectangle now reads as an object without hover and on touch.

## 14. M5 — the gate pass

Four specialists over the combined M1–M4 diff: accessibility, component, ux, frontend
performance. **`database-architect` was not engaged, and that is a decision rather than an
omission** — there is no model, column, index, constraint or migration in this epic, confirmed
against the diff.

**Performance passed with nothing blocking**, having re-derived the epic's own numbers from the
shipped code rather than trusting §12. Two results are worth keeping:

- The `calendarBoundaries` day-walk M3 added to each rebuild was **measured**, not reasoned about:
  **0.024 ms p95 at 4,385 days**, 0.034 at a 20-year span, 0.159 at an absurd 100-year one — under
  2 % of the rebuild baseline. The month-jump alternative is declined on those numbers plus the
  one-date-walk rule.
- **It found the M0-T5 harness is now stale**: its palette predates M3, so `gridMinor`/`gridYear`
  arrive `undefined` and Canvas 2D silently discards them — ADR-0121's own defect, in my
  instrument. §12's figure is a correct **pre-M3** baseline; the corrected re-run with both new
  passes firing is **12.8–15.5 ms p95**, overlapping §12 and inside §8.4's bar.

### 14.1 The finding that matters most, and it is mine

The component review proved **by mutation** that M2's Today-halo test was **vacuous**: `mount()`
passes no `todayDay`, so the component's own `todayDay = null` default applied, the marker never
rendered, and the early-return guard took every run. Changing the marker's background to `red`
left it passing.

**The guard was written to be careful and was the defect.** Its comment was right about the hazard
it named — a bare `getByTestId` would fail for a reason that is not the test's subject — and wrong
that the hazard applied: the fixture does not decide whether today is in span, the **prop** does,
and the file's own convention (`mount({ todayDay: 20 })`) was already a few cases below.

It is the exact shape §13.1 records catching in M1's `it.each`, **recurring one milestone later,
in the sibling file, inside the epic that documented the pattern**. Fixed and re-verified red.

### 14.2 The accessibility review's headline is disproved; its three subsidiary findings stand

It blocked on WCAG 1.4.1, arguing the criticality ladder is **hue-only** on every real plan — the
fringe fires on neither measured plan, near-critical has no fringe, so a third state was added
with no non-hue channel, into the amber/red pair CVD readers resolve worst.

**The premise is wrong, and the numbers it cites as evidence are the evidence against it.**
Measured relative luminance: **0.2152 / 0.1234 / 0.0626** — a monotone ladder, each step roughly a
halving. A luminance ratio **is** a lightness measure, so a hue-only ladder at equal lightness
would read ~1.00:1; these read 2.36 / 1.54 / 1.53 against the product's 1.5:1 floor. This is
ADR-0102's own work, which separated these on lightness _because_ they had previously "differed in
hue and almost nothing else" at 1.23:1.

**Three subsidiary findings were right and are fixed:**

1. **The plan's M2-T2 step 3** ("replace the row-height-gated fringe with a fill-level lightness
   separation") **was specified and not built** — correct, and the reason is that the fills already
   have one. Recorded as ADR-0141 D4: a **plan remedy that had gone stale**, written before
   ADR-0102's ladder was checked, which is §19's rule applied to a fix rather than to a problem.
2. **The ADR was never filed.** The spec's §4.9 says plainly that ADR-0100 is Accepted, that ADRs
   are immutable, and that D5 must be amended by a **new** decision. M3 amended D5 **in place**.
   Reverted, and filed as **ADR-0141** — the rule lost to convenience in the one milestone whose
   own spec warned against exactly it.
3. **`MINIMAP_GROUNDS` omitted `--warning`**, which the Today marker and the frame can both now
   cross. A sweep that does not contain the ground a mark crosses is green for not having looked,
   which is this file's own recorded failure mode. Widened.

And **the docblock that invited the misreading is corrected**: `MinimapPalette.outline` called the
fringe "the 1.4.1 answer". It is a **second** lightness cue on tall rows, not the thing criticality
rests on, and the reviewer read it exactly as written.

### 14.3 The UX review's sharpest finding: the demonstration shot cannot show M1's fix

It pixel-sampled rather than eyeballing, and proved congruence arithmetically: **636 inked frame
pixels is exactly the perimeter of a 200×120 box**. So in every screenshot this epic took, the
viewport rectangle covers the whole picture — and a fill that covers everything cannot read as a
region. It uniformly darkens the ground, which is the same "delimits everything, says nothing"
failure M1 exists to fix, one property along.

§9.6 anticipated the congruence and framed it as a bound on the _worst case_; it did not notice
that this made the epic's only visual evidence the one state where its rank-1 fix is invisible.

**Taken:** `apps/web/.screenshots/m5-fill-in-use.png`, zoomed so the rectangle measures
**78 × 18 px inside the 200 × 120 box** — the state a planner is in whenever they are not looking
at the whole plan, and the one a sign-off should judge.

### 14.4 Recorded rather than acted on

- **The UX review's second blocking item**: §10.4 (lane compression) must go back to the product
  owner explicitly rather than be shelved. It has, twice, and it is put again with this pass. The
  review's judgement is that it is **the dominant remaining term** for any plan with real WBS
  structure, which is the norm in this domain.
- **Panel chrome challenged, fairly**: §13.2's "no change" is a self-assessment by the person who
  built the picture fix, and the old application's minimap border was **primary-coloured** where
  ours is neutral. Left as it is, with the challenge recorded, because the alternative is changing
  a shipped surface on an eye rather than a measurement — a live suggestion, not a closed question.
- **The near-critical margin is thin** — 1.53:1 against a 1.5 floor — and will be the first thing a
  palette nudge breaks. That is the gate working, named here so the failure is legible when it
  comes.
