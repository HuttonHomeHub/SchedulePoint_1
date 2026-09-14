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
