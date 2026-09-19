# M1 — the baseline, and the instrument that could not report it

**Taken:** 2026-09-19, one sitting, tenant `shoot-co-1789804759523`.
**Tree:** the working tree at `013533fb` **plus** the repaired `measure-column-fit.mjs` — stated
explicitly because `run.sha` records `HEAD`, which is not necessarily the tree that was served
(`page-composition/m8/README.md:6-11`).
**Servers:** local `pnpm dev` for both apps against the `scripts/e2e-local.sh` database.

## 1. The instrument had to be repaired before it could report anything

`measure-column-fit.mjs` refused a verdict unless it could still see **Calendars `Working days`**
and **Resources `Code`** wrapping. Page-composition **M2 fixed both**. So from the moment the epic
that probe was written for landed, its control failed at every width, and the only way to obtain a
number was `EXPECT_KNOWN_WRAPS=0` — which removes the guarantee entirely and leaves exactly the
ADR-0093 state the control exists to prevent.

**A control that names a defect is only as durable as the defect.** The replacement is two
assertions and only one of them names a wrap:

1. **Something was measured, asserted in BOTH directions.** Every screen that should carry a table
   must yield one with a measurable column; every screen **declared** table-free must yield none.
2. **A width-keyed wrap.** At 1280 the audit log genuinely needs ~1136px in a ~955px region and
   wraps three declared-`auto` columns. Presence only, never a pixel count — the audit fixture's row
   count varies per run.

**The first version of that repair was red against a correct product**, which is worth recording
because it happened inside the milestone whose whole subject is a control that had gone false.
Written as "every named screen must yield a table", it failed on `org-home` — which has carried
**zero** tables since ADR-0098 built the landing out of sections, and reports zero in the committed
`page-composition/m2/column-fit-1646.json`. Hence the declared exemption, and hence asserting it
both ways: the day `org-home` grows a table, or a table-bearing screen loses one, the probe says so.

**Verified red three ways** (ADR-0110 D5), each restored afterwards:

| Mutation                                           | Result                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Pin a wrap at 1646 that does not exist (`clients`) | `clients: expected at least one wrapped column … and found none` |
| Drop `org-home`'s declared exemption               | `org-home: no table with a measurable column`                    |
| Declare `clients` table-free                       | `clients: declared table-free … but a table was measured`        |

## 2. The Clients baseline — the two-column state, measured for the first time

At **1646**, table width **1271px**, three rows:

| Column  | `used` | `natural` | slack |
| ------- | ------ | --------- | ----- |
| Name    | 870    | 177       | 693   |
| Actions | 401    | 82        | 319   |

`naturalTotal` **259**, so the table's slack is **1012px of 1271 — 80% of the row is empty.**
`factSpread: 0`, `firstRowTop: 305`, `mainScrollHeight === mainClientHeight === 949`,
`overflowsBy: 0`.

**FC-D's prediction held exactly: 1012px, against a written prediction of ≈1012.** It is recorded
as held rather than quietly passed over, because the same habit records predictions that were
wrong. The register row's **922px** is a **pre-D4** figure from when Clients had three columns; this
instrument had never measured the two-column state.

## 3. CQ-2 — `Actions` at 401px for 82px of content: confirmed, and deliberately NOT taken

The spec's claim is true to the pixel. It is still not done here, and the reason is not timidity:

- **It would make M3's verdict uninterpretable.** FC-D clause 2 asks whether the new column is paid
  for out of **existing emptiness** rather than out of another column's content. Changing a second
  column's width policy in the same milestone confounds exactly that measurement.
- **It redistributes emptiness rather than removing it.** `Actions` is the trailing column, so
  shrink-wrapping it moves the buttons **further right**, not closer to the row's facts — and
  ADR-0146 D3's rule is to cap the columns **before** the last fact, never the last fact itself.
  `Actions` is not a fact column at all.
- Whether `fit` on a trailing action column actually improves the row is **unmeasured**, and this
  epic's own rule (ADR-0142 D4) is not to build a remedy on precedent.

Recorded as available, with its number, for whoever wants it.

## 4. A live defect the re-run found, which is not this epic's

**Members' _Pending invitations_ table wraps two columns at 1646** — `Sent` (86 used / 147 natural)
and `Status` (109 / 197). The table renders at **599px** and its content needs **748px**.

It is not a fixture artefact and it is not old: `page-composition/m2/column-fit-1646.json` records
the same table at **full width**, with `Sent: 250/147` and `Status: 335/197`, comfortably fitting.
Something between that reading and today moved that section into a narrow grid column.

**The transferable part is how it survived.** ADR-0146's FC-2 — _nothing wraps beside unused
width_ — is recorded **PASS** in `m8-verdict.md:16`, and its evidence column points at
`m2-measurement.md`. The verdict was carried forward from the M2 reading and never re-taken at M8
over the estate as M8 left it. A condition judged once and quoted afterwards is a claim like any
other.

Filed as `docs/TECH_DEBT.md` #344 rather than folded in: it is a different screen's layout, FC-A's
bar is the Clients table, and fixing it here would change a second baseline mid-epic for the second
time in one milestone.
