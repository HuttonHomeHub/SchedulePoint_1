# M3 — C2c shipped, and the full run agrees with the restricted one

**Taken:** 2026-09-19, same sitting and same tenant as M2 (`composition-co-1789837073773`), against
the **shipped tree** rather than a candidate restored into a dev server — which is the whole point
of re-running it (plan M3-T1 step 3).

**FC-4: PASS.** Zero wrapped cells in the Pending invitations table at 1280, 1646 and 1920, with no
column declared `auto` to achieve it.

---

## 1. The reading, on a full roster

M2's numbers were taken with `ONLY=members`, which removes the width-keyed wrap control and
therefore leaves a restricted run with no pinned positive case (`m2/README.md` §1). These are full
ten-screen runs, so the control is live:

| Width | Pinned case                                                | Findings                               |
| ----- | ---------------------------------------------------------- | -------------------------------------- |
| 1280  | `every screen measured; audit-log wraps`                   | 3 — `audit-log` `Event`/`By`/`Subject` |
| 1646  | `every screen measured; no width-keyed wrap at this width` | **0**                                  |
| 1920  | `every screen measured; no width-keyed wrap at this width` | **0**                                  |

The three surviving findings are the audit log's declared-`auto` columns — the deliberate,
still-live wrap the gate is built to tolerate. **Members contributes nothing at any width**, where
the baseline contributed three columns at all three.

| Width | table | `naturalTotal` | slack | wrapped |
| ----- | ----- | -------------- | ----- | ------- |
| 1280  | 416   | 454            | −38   | **0**   |
| 1646  | 599   | 454            | +145  | **0**   |
| 1920  | 682   | 454            | +228  | **0**   |

**These reproduce M2's restricted readings to the pixel** — 416/599/682, `naturalTotal` 454. A
second run that agrees is evidence (ADR-0125's 58.7 → 65.8ms precedent is the case where it does
not, and that divergence was recorded rather than smoothed). Here there is nothing to record.

`slack: −38` at 1280 with zero wraps is the state `m2/README.md` §6 explains and is not a
contradiction: the folded facts line is 38px wider than the cell, so its two facts **stack** —
each whole, the break falling between facts and never inside a date. Do not read it as equivalent
to the baseline's `slack: −277`, which was three broken values.

## 2. The second failure mode is closed, with a number

`docs/TECH_DEBT.md` #344 recorded a 1280px card overflow nothing had predicted: the table exceeded
its own card and pushed the surplus into `DataTable`'s scroll region, so `Revoke` was off-screen
(`m2/members-1280-baseline.png` shows it clipped at the card edge).

| Reading @1280    | before  | after   |
| ---------------- | ------- | ------- |
| section width    | 466     | 466     |
| inset, each side | 25      | 25      |
| **available**    | **416** | **416** |
| table width      | **473** | **416** |
| **overflow**     | **57**  | **0**   |

`tracks-1280.json`, pinned case `2 grid(s) on /members`. The 57px is this sitting's figure; M0's
was 103px on a different fixture (`m2/README.md` §2 explains why the two differ and why neither is
a constant). Only a fold could close it, because closing it needs the table's **min-content**
reduced.

## 3. What is asserted, and where

- **Unit** (`InvitationsSection.test.tsx`): both facts inside the **address cell** — scoped to the
  cell rather than the row, because before the fold both were already in the same `<tr>` and a
  row-scoped assertion cannot tell the two layouts apart — and the header list is exactly
  `Email, Role, Actions`. Both cases were **verified red against the pre-fold component** (ADR-0110
  D5): `Unable to find an element with the text: /^Sent /`, and
  `expected [ 'Email', 'Role', 'Sent', …(2) ]`. The other eight cases passed unchanged through the
  change, which is what makes them the before/after oracle.
- **Journey** (`composition.spec.ts`): the same two properties against a real API with a real live
  invitation. It exists because the wrap sweep beside it **would go green if a fact were deleted** —
  dropping a column is the cheapest way to stop it wrapping, and it fails the reader in silence.
- **Both branches** are covered: the unit fixture holds one live and one expired invitation in one
  render, so `Expires …` and the `Expired` badge are asserted in their own address cells. M2's
  photographs show only the live branch, which is what the journey fixture seeds.

## 4. What did not change

- **No column is declared `auto`**, which FC-4 requires explicitly: the fit is real, not excused.
- **The section's and the table's accessible names** (`Pending invitations` / `Invited people`) and
  the row semantics are untouched; the existing region, count, confirm-dialog and focus-return
  cases passed unedited.
- **FC-5 clause 1**: `InvitationsSection` has one consumer (`routes/members.tsx:55`) and a screen's
  content width is set by `PageContainer`, so no other screen can narrow. Measured anyway at M2
  (`m2/drift-1646-C2c.json`): every frame width byte-identical.
- **FC-6**: document overflow at 320px is **0**, as it was before; the invitations scroll region's
  own overflow falls 251 → 135 (`m2/reflow-320.jsonl`).
