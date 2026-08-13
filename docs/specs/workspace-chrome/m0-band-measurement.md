# M0 — the workspace's vertical budget, measured at 1646

**Date:** 2026-08-13 · **Harness:** `apps/web/measure-toolbar/vertical-stack.spec.ts`
(`pnpm --filter @repo/web measure:toolbar --grep "M4-T1"`), real Chromium, real plan, pen held.
**Asserts nothing** (ADR-0081 §3).

The product owner made merging the plan-identity line into the app header row a **hard requirement**
of this epic. Nobody had measured whether it fits. This did.

---

## 1. Two instrument repairs, both of which changed the answer

**The app-header probe reported a confident zero, by construction.** It read
`appHeaderRow.children`, and `AppHeaderRow` (`app-header.tsx:150-156`) renders exactly **one** child,
so the adjacent-pair loop never executed and `widestGap` was 0 at every width. `docs/TECH_DEBT.md`
#129 cites that zero as evidence the merge is not feasible. It is an artefact, not a measurement.
The probe now descends through single-child wrappers to the real grid line before measuring, and
reports the organisation nav separately.

**1646 was not in the sweep.** This harness swept 1920 and 1440 for the whole of ADR-0090 and
ADR-0091 — which is how two epics took decisions against widths nobody uses. It is now permanent
here, as it already is in `item-widths` and the fit gate.

---

## 2. What is above the canvas, at 1646

| band                                  |    height |
| ------------------------------------- | --------: |
| shell chrome band (total)             |     192px |
| — app header row                      |      56px |
| — command band (identity + both rows) |     135px |
| —— identity row (breadcrumbs + pen)   |      45px |
| —— row 1 · View and navigate          |      45px |
| —— row 2 · Build and manage           |      44px |
| **above the canvas, total**           | **249px** |
| **canvas**                            | **558px** |

**Chrome is 31 % of the plan's vertical space**, before the armed-tool banner (which takes a further
row while a tool is armed) and before the activities handle at the foot.

---

## 3. Does the identity line fit in the app header row?

Both rows are 1646 wide. Content:

| row                     |    content |       free |
| ----------------------- | ---------: | ---------: |
| app header              |     1049px |      597px |
| identity line           |     1151px |      495px |
| **combined on one row** | **2200px** | **−554px** |

Widest contiguous gap in the header row: **337px**.

Broken down:

| element                                         |     width |
| ----------------------------------------------- | --------: |
| brand mark                                      |     160px |
| **organisation nav** (org picker + seven links) | **637px** |
| account chip                                    |      52px |
| breadcrumb + `Draft` badge                      |     361px |
| modes + view switch + pen cluster               |     790px |

## 4. M0-T4 — the two estimates, now measured

The first pass decomposed the identity line by eye into ~220 px of breadcrumb saving and ~165 px of
pen redundancy. **Both were wrong, in opposite directions, and they nearly cancelled** — which is
why they were gated rather than built on.

**The pen cluster**, three separate things at level three where level two showed one `div`:

| element                          | pen held | pen available |
| -------------------------------- | -------: | ------------: |
| status badge                     |    58 px |         70 px |
| live-region sentence             |   165 px |        187 px |
| the button (`Stop`/`Start`)      |   111 px |        111 px |
| **cluster total**                |   349 px |        385 px |
| **redundant** (badge + sentence) |   223 px |    **257 px** |

The badge and the sentence say what the button says. Estimated 165 px; **measured 257 px** in the
state a reader arrives in — 92 px better than assumed.

**The breadcrumb**, per crumb: `Clients` 48 · `/` 5 · `Northgate` 71 · `/` 5 · `Riverside` 65 · `/` 5
· `Logic` 37. Keeping the plan name and dropping the path it duplicates saves **199 px**. Estimated
~220–235 px; **measured 199 px** — 36 px worse than assumed. (Fixture names are short; a real
hierarchy's path is longer and the saving larger, but so is the surviving plan name.)

**The deficit, pen available — the wider state, and the one a reader arrives in:**

| viewport | header content | header free | identity content | **over one row** |
| -------- | -------------: | ----------: | ---------------: | ---------------: |
| 1920     |        1049 px |      871 px |          1187 px |       **316 px** |
| **1646** |    **1049 px** |  **597 px** |      **1187 px** |       **590 px** |
| 1440     |        1049 px |      391 px |          1187 px |       **796 px** |

**Tidying the identity line yields 456 px** (257 pen + 199 breadcrumb). So:

- **1920 — the merge fits on tidying alone**, with 140 px to spare.
- **1646 — 134 px short.** Something else must give.
- **1440 — 340 px short.** Only the nav closes it.

## 4a. What closes the last 134 px at 1646

| candidate                                    |   saves | verdict                                                                       |
| -------------------------------------------- | ------: | ----------------------------------------------------------------------------- |
| brand wordmark → mark only (block is 160 px) | ~120 px | **14 px short. Too tight to call a fit.**                                     |
| mode switches → icon-only                    | ~200 px | Closes it, but reverses ADR-0091 M7's `showLabel: 'always'` from the same day |
| organisation nav → one trigger (637 px)      | ~517 px | Closes 1646 **and** 1440, with room                                           |

**So the nav collapse is not required at 1920, is one of three ways to close 1646, and is the only
way to close 1440.** The earlier conclusion — "the only single item large enough is the nav" — was
true of the unreduced deficit and is **withdrawn** for the reduced one: after tidying, 134 px is
small enough that cheaper candidates exist. Which to spend is a product decision, not an arithmetic
one.

## 5. What this does not measure

- A **coarse** pointer, where every control widens 32 → 40px (`docs/TECH_DEBT.md` #133).
- Any width below 1440 or above 1920 — the merge's feasibility at 768 is unknown and a collapsed
  nav may change the answer in either direction.
- Chromium only.
- One plan, pen held, in Early mode. The pen cluster's width differs between held and available
  (`Stop editing` vs `Start editing` plus a different status sentence), and only the held state was
  measured.
