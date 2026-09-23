# M5 — link ink

> **Status:** Complete. **The milestone's own premise is falsified in both the ways it could have
> been true, so M5 is WITHDRAWN as specified** — and one candidate the measurement does point at is
> rendered and offered rather than taken.
>
> `node apps/web/scripts/measure-ink.mjs`, `measure-link-distinctness.mjs`, `shoot-link-dash.mjs`,
> at `6e704132`.

M5's stated outcome:

> the relationship stops being the quietest thing on a surface whose subject is relationships.

Its first development step is **measure the ink distribution, then design** — Part A §4.5 listed
four candidate terms and said the design picks from the measurement rather than from the list. The
measurement was taken first, and it says the outcome is already true.

## 1. By area: link ink is 58–114 % of bar ink

Both M0 fixtures, at 1646 (the product owner's Surface Pro) and 1920, at the whole-plan framing and
the working zoom. Ink is px²: a link's polyline length × the `lineWidth` it was flushed with, a
bar's `w × h` from `activityRect` — the painter's own rect source, the same one `gutterStats`
measures bars with.

| fixture    | px/day | bars | bar ink | links | link ink | solid     | dashed     | link : bar |
| ---------- | ------ | ---- | ------- | ----- | -------- | --------- | ---------- | ---------- |
| Unit 300   | 4      | 129  | 70,256  | 187   | 64,237   | 63/28,762 | 124/35,475 | **0.914**  |
| Unit 300   | 12     | 60   | 130,344 | 90    | 76,819   | 30/30,220 | 60/46,599  | **0.589**  |
| small plan | 4      | 17   | 2,380   | 29    | 2,716    | 10/1,380  | 19/1,336   | **1.141**  |
| small plan | 12     | 17   | 7,140   | 29    | 4,244    | 10/2,084  | 19/2,160   | **0.594**  |

**On the small plan at the whole-plan framing the link layer carries more ink than the bars do.**
Solid and dashed are reported apart because a dashed line's drawn ink is a fraction of its length
and the fraction is not recoverable from the recording (`RecordedPath.dashed` is a boolean, not the
pattern) — one number treating a dash as solid would overstate exactly the non-driving links this
milestone is about. Text is **not** counted (`fillText` records no geometry), so every ratio is
bar-versus-link and not a share of all ink; said plainly so nobody quotes it as the latter.

**A pixel count was rejected for a reason worth recording.** `TsldPalette` has one `critical` field,
read both by a critical bar's fill and — in principle — by a link. In the recording context the two
separate by flush kind; in a rendered image they are the same colour. A mask palette would have
attributed every critical bar to the link total, silently, and reported a flattering number for
exactly the plans where criticality matters most.

## 2. By weight: M3 already tripled it

| fixture    | px/day | mean bar height | link widths         | link : bar weight |
| ---------- | ------ | --------------- | ------------------- | ----------------- |
| Unit 300   | 4      | 6.12 px         | 1 px ×124, 2 px ×63 | **0.219**         |
| Unit 300   | 12     | 6.35 px         | 1 px ×60, 2 px ×30  | 0.210             |
| small plan | 4      | 5.00 px         | 1 px ×19, 2 px ×10  | 0.269             |

The mean bar height, not `BAR_HEIGHT`: a milestone's diamond and a summary's bracket are not 5 px,
and quoting the constant would describe a picture made only of tasks.

At `BAR_HEIGHT = 18` the same ratio was ≈ 0.074. **M3 moved it by roughly 3× by thinning the bar**,
which is the sharpest reading of why M5's premise no longer holds: the milestone that was going to
make the line louder was preceded by one that made everything it competes with quieter.

## 3. By contrast: the link is louder than the bar

Resolved in Chromium under `[data-surface="canvas"]` and read back as painted pixels — the only
authoritative place, because ADR-0102's finding is that an `@theme inline` alias declared at `:root`
is substituted on the element that declares it and a surface rebind can never reach it, so a value
parsed out of the stylesheet can be right about the file and wrong about the picture.

| token                | what it draws              | vs the ground | vs the link |
| -------------------- | -------------------------- | ------------- | ----------- |
| `--foreground`       | the data-date rule, labels | 11.17:1       | 2.10:1      |
| `--destructive`      | a critical bar             | 7.57:1        | 1.43:1      |
| `--muted-foreground` | **every dependency line**  | **5.31:1**    | —           |
| `--warning`          | a near-critical bar        | 4.88:1        | 1.09:1      |
| `--primary`          | **an on-schedule bar**     | **3.14:1**    | 1.69:1      |
| `--border`           | day/month/year gridlines   | 1.17:1        | 4.55:1      |
| `--canvas-lane-rule` | the lane rule              | 1.07:1        | 4.98:1      |

**The link is the second-strongest neutral on the surface, 4.5–5.0× the furniture and 1.69× the
commonest bar.** The premise is false twice over: the relationship is neither quiet nor hard to
separate from the lines it sits among. What is faint is the **work** — filed as
`docs/TECH_DEBT.md` #368, because that is a theme question rather than a geometry one.

**One thing I nearly wrote and checked instead.** The table shows `--warning` at 1.09:1 against the
link and `--destructive` at 1.43:1, which reads as "criticality on a link is colour-only at almost
equal lightness" — a WCAG 1.4.1 finding. It is not one, because **criticality is not drawn on links
at all**: `paint.ts:1312` and `:1334` set `ctx.strokeStyle = palette.edge` for both the driving and
the non-driving pass, and the sentinels for `critical`/`nearCritical` exist in the harness for bars.
The finding was reached from a table and disposed of by opening the file (§19.11).

## 4. What the measurement DOES point at, and it is the product owner's

**124 of 187 links are 1 px dashed**, and a `[4, 3]` dash over a 1,500 px channel run is about 214
separate marks to follow. That is a **continuity** problem rather than a contrast one, and the
driving/non-driving cue does not depend on the dash: it is already carried by **weight** (1 px
against 2 px), which is not colour, so WCAG 1.4.1 survives dropping it.

Rendered rather than argued — `link-dash-today.png` and `link-dash-dropped.png`, the busiest
occlusion cluster at 1646 × 420, 12 px/day, band off, produced by rewriting the one `setLineDash`
site in the **bundle** (M-C0-T4's method: nothing in the repository is modified for the length of
the run, and the substitution asserts its match count, so a silent miss appears as two identical
pictures rather than as a false conclusion).

Looking at the pair: a single line is plainly easier to trace across the frame without the dash, and
the layer as a whole reads as a heavier presence — several parallel solid runs in one channel look
like a bundle of wires where the dashed version reads as texture. **Which of those a planner
prefers is not a thing this harness can decide**, and FC-L8 limb 1 says in terms that a cue that
goes is a **product-owner decision, not a milestone's**. So the pair is offered and nothing is
changed.

## 5. Verdict

**M5 is withdrawn as specified and recorded as measured-and-rejected**, the fifth time in this epic
that a measurement has contradicted a plan's own problem statement (after FC-C1's comparands,
ADR-0149 D5, ADR-0097 Landing C and D1, and M4's four rules). Making an already-5.31:1 line louder
on a surface where the bars are at 3.14:1 would make the picture noisier, not more legible.

Nothing is built, so the three canvas traps FC-L8 limb 5 names — ADR-0102's unreachable alias,
ADR-0100 M4's token pair that painted nothing while the contrast gate stayed green, ADR-0121's
`fillStyle` setter that silently discards an unparseable value — **do not fire, because no new
colour value exists**. That is a structural argument rather than a claim to have cleared them, and
it is the reason this milestone needs no browser colour check of its own beyond §3's reading.

Two observations are filed rather than acted on: `docs/TECH_DEBT.md` **#367** (the link's ink is the
page's secondary text colour, by aliasing, and correct today by luck) and **#368** (the work is
fainter than the relationship between work).
