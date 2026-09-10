# M4 measurement — the declared rows

- **Status:** Accepted — readings taken 2026-09-10 on the M4 tree (`measure-console.mjs`, the
  control run's 32-char plan name)

| width | deck lines before → after | group → line, after                    | band |
| ----- | ------------------------- | -------------------------------------- | ---- |
| 1920  | 2 → **2**                 | View, Find → 1 · Author, Plan → 2      | 143  |
| 1646  | 2 → **2**                 | same                                   | 143  |
| 1440  | **3 → 2**                 | same — where `Find` used to drop       | 191  |
| 1280  | 3 → **3**                 | View → 1 · Find → 2 · Author, Plan → 3 | 235  |

## What the declaration bought, and it is not the line count

At 1920 and 1646 the deck was already two lines, so nothing moved there — **which is the point**.
M0-T3 measured the arrangement as an accident of flex line-breaking: at **1440**, `Find` dropped to
line 2 and took the whole DO set with it, so every command in the band changed position. Nothing
held it, and nothing in CI counted deck lines at all since ADR-0109 D1 deleted the width ladder.

Two things are now true that were not:

1. **1440 is two lines**, because the LOOK row wraps within itself rather than displacing DO.
2. At **1280**, where the deck genuinely needs three lines, the wrap is **local**: `Find` moves to a
   second LOOK line and the DO set stays together on one. Before, a third line meant `Plan` alone at
   the bottom with `Author` beside `Find`.

A wrap inside a row can never re-teach a planner where the other row's commands are. That is the
whole claim, and it is now asserted rather than hoped for.

## The gate is per row, and by membership

`command-surface.spec.ts`'s case now asserts each row's own line count (LOOK ≤ 1 at ≥ 1440 and ≤ 2
below; DO exactly 1 at every width) **and membership** — that no command appears in both rows, that
`search` is in LOOK and `add-activity` in DO. **Verified red by moving `find` to the `do` row in a
scratch build**, which is the edit a later reader might make: the line counts stayed legal and the
membership assertion named it (`the search field left the LOOK row`).

Pinned by group rather than by a list of ids, so adding a command to an existing group needs no edit
to the gate.

## Two instruments went stale on this milestone, in the same way

`measure-console.mjs` read the deck's groups as `:scope > [role="group"]` and derived its line count
as **height ÷ tallest child**. M4 puts the groups inside a row wrapper, so:

- the selector returned an **empty list** — the harness reporting nothing about a structure that had
  changed under it, which is only visible because the arithmetic downstream threw;
- the ratio reported **1.55 lines** for a deck of three visual lines, because the tallest child was
  now a two-line row wrapper.

Both fixed: the groups are found at any depth and tagged with their declared row, and the line count
clusters the **controls'** tops — which is exactly the correction M1-T4's gate had already made for
the same reason, one instrument along. A ratio is only a line count while every child is one line.
