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

## 4. The conclusion, and it is not the expected one

**The merge needs 554px and the only single item large enough is the organisation nav.**

| candidate reduction                                          |      saves |
| ------------------------------------------------------------ | ---------: |
| breadcrumb → plan name + badge only (it duplicates the rail) |     ~220px |
| pen redundancy (live-region sentence + `Editing` badge)      |     ~165px |
| **both together**                                            | **~385px** |
| collapsing the seven-link nav behind one trigger             |     ~517px |

Breadcrumb and pen savings together are **169px short**. So the hard requirement cannot be met by
tidying the identity line alone: **it requires collapsing the organisation nav**, which is a
product decision about every screen in the application, not a plan-workspace decision.

The two ~220px and ~165px figures are **estimates from the measured composites**, not direct
measurements — the probe reports the identity line as two children (361px and 790px) and does not
yet break the pen cluster out. The 637px nav, the 597px free space and the 554px deficit **are**
direct measurements. Before anything is built on the estimates, the probe should report the pen
cluster and the breadcrumb's name-only width separately.

## 5. What this does not measure

- A **coarse** pointer, where every control widens 32 → 40px (`docs/TECH_DEBT.md` #133).
- Any width below 1440 or above 1920 — the merge's feasibility at 768 is unknown and a collapsed
  nav may change the answer in either direction.
- Chromium only.
- One plan, pen held, in Early mode. The pen cluster's width differs between held and available
  (`Stop editing` vs `Start editing` plus a different status sentence), and only the held state was
  measured.
