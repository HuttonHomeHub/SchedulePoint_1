# M0 — the measurement, and the two findings that change the design

_Every figure here names the run that produced it. Nothing in this file is estimated; where a number
is still unmeasured it says so. Run 2026-08-12 in Chromium (`/opt/pw-browsers/chromium`, Playwright
`measure-toolbar` config) against a real API and a populated plan with the pen **held**._

---

## 1. M0-T1 — the vertical-stack harness was under-reporting, and the hypothesis was right

**Run:** `pnpm --filter @repo/web exec playwright test --config playwright.measure-toolbar.config.ts vertical-stack`

The harness asked for six bands (`vertical-stack.spec.ts:83-90` as it stood) and reported **five**.
The plan-header lookup was `document.querySelector('h1')?.closest('header')`; ADR-0090 M4-T2 turned
that element into a `<div>` and left the `sr-only <h1>` inside `<main>`, so the lookup returned
`null` from that day on, `read()` returned `null`, and `.filter((b) => b !== null)` dropped it.

**What makes this the ADR-0058 defect rather than a bug:** every surviving number was still correct.
`aboveCanvas` read a plausible **249**, the two rows read 45 and 44, and nothing looked wrong. The
missing band was only findable by arithmetic — the command band read **135** against rows summing to
**89**, leaving **46 px** unaccounted for.

Repaired: the identity row is now located structurally (the command band's first child, verified to
carry the breadcrumb `nav`), and **a band that cannot be located throws** instead of being filtered
out. Re-run reports six bands:

| band                                | height |
| ----------------------------------- | ------ |
| shell chrome band (total)           | 192    |
| app header row                      | 56     |
| identity row (breadcrumbs + pen)    | **45** |
| command band (identity + both rows) | 135    |
| row 1 · View and navigate           | 45     |
| row 2 · Build and manage            | 44     |

`aboveCanvas` **249**, canvas height 541 at 1920×1080. The plan's known-good anchor — "the identity
row reads 45 px and `aboveCanvas` reads 249" — is **matched**, which is what licenses the rest of
this file.

## 2. M0-T2 — the search icon is COVERED, and its geometry is already correct

**Run:** `… --config playwright.measure-toolbar.config.ts search-icon` (new probe, `search-icon.spec.ts`)

The three candidate defects are distinguished by evidence, not by reading the CSS:

| measured                                | value                     |
| --------------------------------------- | ------------------------- |
| icon found                              | yes, 16 × 16              |
| `opacity` / `visibility`                | `1` / `visible`           |
| icon `position` / `z-index`             | `static` / `auto`         |
| icon `margin-right`                     | `-24px`                   |
| wrapper `position`                      | `static`                  |
| input `position` / `background-color`   | `static` / `oklch(1 0 0)` |
| input `padding-left`                    | `32px`                    |
| `elementFromPoint` at the icon's centre | **the input**             |

> **CORRECTION, 2026-08-12 (M4).** The verdict above was **not established by this evidence**, and
> the row that produced it is the reason. The icon is `pointer-events-none` — correctly, it is
> decorative, and the house primitive does the same — and **`elementFromPoint` skips such elements
> entirely**, returning whatever sits beneath. So the probe was answering _"is the icon
> hit-testable?"_, whose answer is **always no, by design**, while appearing to answer _"is the icon
> painted on top?"_. It reported `COVERED` in **both** states and could not have said anything else.
>
> That is an ADR-0076 Class 3 failure inside the file written to prevent them: a decision-bearing
> claim asserted from an instrument that could not support it. It was caught only because the fix
> was re-measured rather than assumed to have worked — the probe still said `COVERED` afterwards.
>
> The probe now neutralises `pointer-events` for the duration of the read and reports the full hit
> stack inside the same window. Re-measured, the corrected findings are:
>
> - The original markup **was** wrong, and the icon **was** invisible. Two non-positioned inline
>   siblings paint in document order, so the input covered it.
> - **The expected two-line fix does not work.** A `relative` wrapper with
>   `absolute inset-y-0 … my-auto` still measured `COVERED`; that combination was applied, confirmed
>   live (`position: absolute`, wrapper `relative`) and still did not put the icon on top.
> - What **does** work, measured: `absolute top-1/2 left-2.5 z-10 -translate-y-1/2`. The stack at
>   the icon's centre now reads `svg(ICON) pos=absolute z=10` above `input(INPUT)`.
>
> The one thing the original probe got right stands, because it rests on geometry rather than on
> hit-testing: icon left **1167.5** against input left **1159.5** is 8 px inside an input whose
> `padding-left` is 32 px, so the placement was already correct and `pl-8` stays.

**Verdict as first reported: COVERED** — kept above rather than rewritten, because the wrong version
is the finding. What the measurement actually supported at the time was only _"the icon is present,
16 × 16, opaque and visible, and is not hit-testable at its own centre"_ — the last clause being
true of any decorative icon anywhere in the product.

## 3. M0-T3 — the width budget, and the two findings

**Run:** `… --config playwright.measure-toolbar.config.ts item-widths` and `… vertical-stack`

### 3.1 Row 1 at 1920 (container 1904)

|                                                                                       | width   |
| ------------------------------------------------------------------------------------- | ------- |
| Row 1 laid-out total                                                                  | 1543    |
| slack                                                                                 | **361** |
| mode cluster (`mode-early` 96 + `mode-visual` 102 + `view-tsld` 76 + `view-gantt` 55) | **329** |
| `zoom-preset`                                                                         | 102     |

Removing the mode cluster frees 361 + 329 = **690** — which matches the pre-measurement estimate of
"~690 spare once the mode cluster leaves" exactly. Removing `zoom-preset` too gives **792**.

### 3.2 The identity content is 849 px, not 450–500

This is the number decision 2 turns on, and the estimate was low by ~350 px.

| part                                                       | width   |
| ---------------------------------------------------------- | ------- |
| breadcrumb trail `Clients / Northgate / Riverside / Logic` | 270     |
| `Draft` status badge                                       | 46      |
| `Finish 05 Jan 2026` chip                                  | 128     |
| gap                                                        | 28      |
| **breadcrumb cluster**                                     | **500** |
| `Editing` badge                                            | 58      |
| `You're editing this plan.`                                | 165     |
| `Stop editing` button                                      | 111     |
| **pen cluster**                                            | **349** |
| **identity content total**                                 | **849** |

### 3.3 FINDING 1 — three bands does not fit at 1920 as specified

A merged row must carry Row 1's content **plus** the identity content. With `zoom-preset` moving
into `View ▾` (decision 4):

```
1543 (Row 1) + 849 (identity) − 102 (zoom-preset leaves) = 2290
container                                                  1904
                                                  deficit  386
```

The mode cluster moving from Row 1 to the identity line (decision 1) does not change this — it is
already inside the 1543 and stays inside the merged row either way.

**386 px has to come from somewhere.** What is available without losing information:

| candidate                               | saving | cost                                                                         |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `You're editing this plan.`             | 165    | none — the `Editing` badge and the `Stop editing` button each already say it |
| `Editing` badge                         | 58     | low — redundant with a button reading `Stop editing`                         |
| truncate breadcrumb trail to leaf + `…` | ~150   | **real** — the path is how a planner knows which plan they are in            |

165 + 58 = **223** without any loss. That leaves **163 px** still to find, and the only remaining
candidate is breadcrumb truncation, which is a genuine loss rather than a redundancy.

The `Finish 05 Jan 2026` chip (128) is **not** a candidate: the product owner asked for it back
beside Summary, and moving it between rows is net zero for a merged row anyway.

### 3.4 FINDING 2 — decisions 2 and 4 compete, and at 1440 they cannot both hold

Decision 4 keeps `zoom-out` / `zoom-in` / `Fit` / `Today` inline at **every** width. Those four are
currently folded below `comfortable`. At **1440** (container 1424), un-folding them:

```
1167 (Row 1 at 1440) − 156 (zoom-preset leaves) + 430 (the four return: 106+96+108+120) = 1441
container                                                                                  1424
                                                                                  deficit    17
```

**Row 1 overflows at 1440 on decision 4 alone**, before any identity content is merged into it. The
spec anticipated this risk at 768 and rated it high; the measurement puts it at **1440**, which is
inside the range the epic exists to serve — the product owner's own 24" monitor is 1920, but a
half-screen window on one is 960.

This is not an argument against either decision. It is the measurement establishing that they draw
on the same slack, so the epic cannot take both at their full scope, and the choice belongs to the
product owner rather than to whichever milestone reaches the slack first.

## 4. Confirmed as measured-impossible: TECH_DEBT #129

The app header row holds **1 child using 1888 of 1920 px, widest gap 0**. There is no slot to put
plan identity into, independent of the ADR-0029 / ADR-0055 S2 objection that the shell is
plan-unaware. #129 stays declined, now with a number.

## 5. Corrections to this epic's own documents

- The identity content estimate of "~450–500 px" was wrong; it is **849**. Recorded rather than
  quietly updated, because it is what turns decision 2 from arithmetic into a trade.
- `attribution.spec.ts` fails: it asserts `finish-chip` is on Row 1, and ADR-0090 M2 moved it off.
  A stale harness, not a product defect — but it fails **loudly**, which is why it was caught in
  the first run and the vertical-stack under-report was not.

## 6. Still to measure (M0-T3 steps 3–5, not blocked by the above)

- Row 1 / Row 2 cost at 1920 and 2304 if the tier-3 candidates were admitted **labelled** (decides
  M6's P1/P2).
- The `Go to today` split button's projected width against `today` + `go-to-date` today.
- The search field's width with the placeholder `Search activities`.
