# M4 — the gate armed, and the false positive it found in itself

**Taken:** 2026-09-19. Four full journey runs plus two instrumented ones, against a real API.

**The gate is armed and green: 24 screen-widths examined, 6 declared-`auto` wraps tolerated,
0 findings, 14 tests passed.** The FC-2 mutation was re-verified **after** arming, which is the
point of doing it twice: an exemption verified only in report-only mode has not been verified in the
mode that ships.

---

## 1. What changed

- `WRAP_SWEEP_REPORT_ONLY` deleted, with its docblock. The sweep now asserts `findings` is empty.
- The `examined.length > 0` limb **survives** the switch and is asserted **first** — an empty
  `findings` is produced by a clean estate and by a sweep that visited nothing, and only one of
  those is a pass (ADR-0093).
- `no table cell wraps while its table has room` **deleted whole**, not left beside its replacement.
  Two gates asserting overlapping things is how a roster falls behind again, and a gate whose
  subject is covered elsewhere is not a safety net (ADR-0109 D1's reasoning for deleting a gate
  **with** the thing it tested).
- The surviving test is renamed `no table cell wraps unless its column is declared auto`, and its
  docblock records what the old title claimed and its body never did: a **slack** rule. The failure
  message said it too (`${path} has a cell wrapping inside a table with room`), and that sentence is
  what misled the first reading of `docs/TECH_DEBT.md` #344. A slack rule would also have been a
  gate incapable of failing — **zero of the nine wraps in the measured estate sat in a table with
  positive slack** (`m0/README.md` §2).

## 2. Arming it found a defect in the gate, not in the product

The first armed run failed on one finding:

```
FINDING: members@1280 Email (undeclared) "invited-…@example.comSent 19"
```

**It was a false positive, and establishing that took three runs and one wrong turn.**

The wrong turn is recorded because it is the useful part. The first response was to change the
**product** — stack the two folded facts with `flex-col` instead of letting them reflow — on the
theory that making the two wrap detectors agree was a layout problem. **It did not work**: the
finding reproduced unchanged, and that failure is what sent the diagnosis one level down.

Instrumenting the clone element by element showed the address span rendering **261×48 — three
lines — inside the clone**, while the same span on the same page measures **264×20 — one line** in
the live DOM. The clone was not reproducing the cell. Printing the resolved fonts settled why:

```
tdFontShorthand=""
REAL  family="IBM Plex Sans", … size=14px weight=400
CLONE family="IBM Plex Sans", … size=16px weight=400
```

`getComputedStyle(td).font` is the **empty string**. Chromium refuses to serialise the `font`
shorthand whenever a longhand it cannot express is non-initial, and Tailwind's `text-sm` sets
`line-height` — so it is empty for every cell in this product. Assigning it sets nothing, and the
clone renders at the document default 16px against the product's 14px: **every measured string ~14%
too wide, and this cell's `text-xs` sub-line measured at 16px instead of 12px, ~33% too wide.**

`measure-column-fit.mjs` never had the defect, because it copies `fontSize`, `fontFamily`,
`fontWeight` and `letterSpacing` as longhands beside the shorthand. **Two implementations of one
rule, drifting invisibly until arming this limb forced them to answer the same question out loud** —
the ADR-0065 shape. The hardening is copied across with the measurement in its docblock; the
duplication itself is `docs/TECH_DEBT.md` **#345**, because a shared module needs a `page.evaluate`
body that can close over an import and that is a deliberate change rather than a milestone's last
five minutes (ADR-0105).

**The `flex-col` experiment was reverted** and the original `flex-wrap` restored, with the episode
kept in `InvitationsSection`'s docblock: the layout it would have changed is the one M2's
measurement had already chosen, and it was being changed to satisfy a broken instrument.

## 3. Verified in both directions

| Run                                                               | Result                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Armed, unhardened detector                                        | **1 finding** — `members@1280 Email`, a false positive               |
| Armed, unhardened, `flex-col` product change                      | **1 finding**, unchanged — which is what disproved the layout theory |
| Armed, hardened detector, original product                        | **0 findings**, 6 tolerated, **14 passed**                           |
| Armed, hardened, `width: 'auto'` deleted from `AuditEventList:86` | **1 finding** — `audit-log@1280 Event (undeclared)`, **red**         |

The last row is M4-T1's required re-verification. The declaration is load-bearing: remove it and the
armed gate fails, naming the column and its now-`undeclared` state. The six tolerated wraps are the
audit log's real, deliberate ones, and they still report — so the hardening removed a false positive
without removing the gate's reach, which is the pair of facts that makes it a repair rather than a
weakening.

## 4. Rosters

`check:e2e-roster` and `check:ci-roster` both pass, unchanged: **no script and no CI step is added**,
so neither roster moves. Confirmed rather than assumed, as the plan's step 4 requires.

`scripts/e2e-durations.json` is **not edited**. It is harvested from one real CI run and its own
docblock says to re-harvest rather than trust it; this milestone adds one test to an existing suite,
which is inside the noise that file describes (five samples of one job spanning 40–47 minutes), and
hand-editing a harvested figure with an estimate is exactly what its `residualCheck` exists to
catch.
