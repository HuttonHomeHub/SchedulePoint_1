---
'@repo/api': minor
---

EV2b: wire the **Earned-Value read endpoint** (ADR-0042 §2). A new `cost:read`-gated
`GET /organizations/:orgSlug/plans/:planId/schedule/earned-value` returns the plan's P6 Earned-Value
analysis (BAC, PV/BCWS, EV/BCWP, AC/ACWP → SV, CV, SPI, CPI → EAC, ETC, TCPI, VAC) per activity, rolled
up over the WBS tree, and as a plan total. It is a **pure read**: it consumes the persisted CPM dates
plus the cost / %-complete inputs and runs the dependency-free `computeEarnedValue` module — no lock, no
recompute, no engine write, so the recalc parity gate is untouched.

**RBAC:** `cost:read` is Planner + Org Admin only, so a Viewer/Contributor never reads the commercially
sensitive money through a schedule read (403); an unknown/cross-org plan is a 404 (anti-IDOR), resolved
from the caller's own memberships before any load.

**Baseline cost snapshot (the ADR-0025 amendment):** baseline **capture** now freezes each activity's
budgeted cost — `Σ assignments (budgetedCost ?? round(budgetedUnits × costPerUnit)) + budgetedExpense`
— into `baseline_activities.budgeted_cost`, giving the active baseline a committed PV reference. A plan
with no cost data snapshots an integer `0` (a real "no budget"), so a baseline captured now always
stores a value; only a pre-EV baseline (SQL NULL) makes the read report `costBaselineMissing` and fall
back to the live budget for PV. Additive and behaviour-preserving — the CPM engine, recalc, and the
general reads are unchanged, and cost stays out of every non-`cost:read` response.
