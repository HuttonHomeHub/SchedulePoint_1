# The closure, measured

> **Landing A, 2026-08-18.** `design.md` §1.5 argues that the rebound family should be a
> **closure** rather than a hand-written list, on the grounds that _"the defect is never 'a token is
> not rebound' — it is a pair whose two halves are governed by different scopes"_. That argument was
> made from reading. This document is the measurement, and it is what the implementation is built
> from rather than the prose.

## 1. What the closure actually pulls in

`@theme inline` exposes **46** unqualified colour tokens as compilable utilities. `REBOUND_NAMES`
holds **18**. The other **28** classify cleanly, which is itself evidence the rule is the right
shape — a rule that produced a ragged remainder would be the wrong rule:

| Class               | Count | Members                                                                                                                                                                                | Disposition                                                                                                                           |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Closure members** | 11    | `--destructive`, `--destructive-foreground`, `--destructive-hover`, `--secondary`, `--secondary-foreground`, `--success(-foreground)`, `--warning(-foreground)`, `--info(-foreground)` | **Join the family.** Each is a fill a component can paint ON a scoped `--background`.                                                 |
| **Resets** (§1.5c)  | 4     | `--card`, `--card-foreground`, `--popover`, `--popover-foreground`                                                                                                                     | Not members and not exceptions — surfaces in miniature.                                                                               |
| **`PLOT` pack**     | 6     | `--canvas`, `--canvas-band`, `--canvas-grid-{day,month,year}`, `--canvas-nonworking-hatch`                                                                                             | Declared by the `canvas` scope (Landing E).                                                                                           |
| **`GROUND` pack**   | 2     | `--ground`, `--ground-end`                                                                                                                                                             | Declared by `auth`.                                                                                                                   |
| **Data vocabulary** | 5     | `--chart-1` … `--chart-5`                                                                                                                                                              | Deliberately outside — ADR-0077 records that binding the login motif to chart tokens keeps the page theme's values on a pinned panel. |

## 2. The six failures, and they are not theoretical

Each closure fill measured against each scope's own `--background`, sRGB contrast, WCAG 1.4.11's
3:1 bar for a non-text UI component:

| scope      | `--destructive` | `--secondary` | `--success` | `--warning` | `--info`   |
| ---------- | --------------- | ------------- | ----------- | ----------- | ---------- |
| **page**   | 6.15            | 11.34         | 4.92        | 4.59        | 11.34      |
| **chrome** | **2.47** ✗      | **1.34** ✗    | 3.09        | 3.31        | **1.34** ✗ |
| **panel**  | 5.69            | 10.48         | 4.54        | 4.24        | 10.48      |
| **brand**  | **2.47** ✗      | **1.34** ✗    | 3.09        | 3.31        | **1.34** ✗ |
| **auth**   | 6.48            | 11.95         | 5.18        | 4.83        | 11.95      |

**Six failures, all on the two navy scopes.** `--secondary` and `--info` at **1.34:1** against navy
is not a marginal miss — it is very nearly invisible, which is precisely the defect ADR-0055 was
opened about, surviving in the tokens that decision's family did not cover. `chrome` and `brand`
share the failures because they share the navy fill; `panel` passes only because it is currently
light.

`--success` and `--warning` clear 3:1 on navy, but by 0.09 and 0.31. They are declared with the rest
rather than left inherited: a family that covers three of five status fills is the "complete or it is
a trap" failure one level down, and those two margins are inside the range a later value tweak moves.

## 3. What this settles

The closure stops being a tidier way to write a list and becomes a **defect finder**. Nobody raised
any of these six; three separate people found tokens outside `REBOUND_NAMES` one at a time and each
time the available answer was "add that one". Computing the set finds all of them at once, and finds
the ones nobody has looked for yet.

**The blind spot stays stated:** this is computed from what a utility _can_ compile, not from what
the product _does_ render, so it governs pairs the product may never make. That is the correct
direction to be wrong in — a governed pair nobody renders costs three lines of CSS; an ungoverned
pair somebody renders costs a WCAG failure nobody can see coming.

## 3a. What it costs, now that the scope count is six

The table above sweeps **five** scopes because those are the five that exist. `canvas` is the sixth
and lands at **E**, so the closure's arithmetic has one more multiplication to come and it is worth
stating before it arrives rather than discovering it in that landing.

- **A family goes 18 → 31 names.** Thirteen closure members join the eighteen base tokens; the
  shipped `chrome` rebind block is the reference implementation. **This said eleven and 29 until
  2026-08-19**, when the block was counted rather than derived from the closure's description —
  `computeReboundNames()` returns **31**, and the two the prose missed are the hover pair
  (`--primary-hover`, `--secondary-hover`), which are exactly the kind of member a hand-written
  arithmetic drops. The gate was right throughout: `token-architecture.test.ts` asserts set equality
  against every scope's block, so no scope was ever short. Only the sentence was.
- **Six families × 31 = 186 declarations, once**, plus the `PLOT` (6) and `GROUND` (2) packs.
  Against the pre-epic 5 × 18 × 3 themes = 270, that is still a reduction — **but a little under
  two thirds, not the "roughly a third of the surface" `design.md` §0.5.1 originally claimed with
  five families of eighteen.** Corrected there.
- **`canvas` owes all thirteen**, and the "declare it or it is a trap" rule is not weakened for it.
  It is tempting to argue that a status **fill** never appears on a diagram — but the ADR-0092 dock,
  the create popover and the bulk-selection bar are DOM inside the diagram container, and every one
  of them can render a `Button` with a `destructive` or `secondary` variant. That is the pair the
  closure exists to govern, so the argument for exempting the canvas is the argument the six
  measured failures below already refuted for `chrome`.
- **The seventh scope is therefore a bigger commitment than the sixth was.** ADR-0097 D14's bar was
  written when a scope cost 18 declarations. It now costs 31, thirteen of which need a derived value
  clearing 4:1 against that surface's fill. The bar has not changed; the price behind it has.

## 4. Method

`--color-*` declarations parsed out of the real `@theme inline` block in
`apps/web/src/styles/globals.css`; OKLCH converted to sRGB and composited; ratios by the WCAG 2.x
relative-luminance formula. Re-derivable — the contrast machinery is the same one
`src/styles/token-contrast.test.ts` uses, which is the point: these numbers become assertions in
that file rather than staying in this one.
