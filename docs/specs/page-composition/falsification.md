# Page composition — falsification conditions

**Committed 2026-09-17, at M0, before any remedy exists.**

That ordering is the whole point (ADR-0142 D4): a condition written after the remedy is worth
nothing, because it can be written to describe whatever was built. Every bar below has a **measured
baseline** taken on today's tree, and the instrument that judges it already exists and has already
been made to fail.

Baselines: `m0/drift-{1280,1646,1920}.json`, `m0/drift-320.json`, `m0/column-fit-{1280,1646}.json`.
Method and the instruments' own faults: `m0-measurement.md`.

---

## FC-1 — one measure

**Restated at M0, and the restatement is a correction rather than a softening.**

As drafted, FC-1 required every in-scope screen's _rendered content width_ to agree within 2px at
1280, 1646 and 1920, "including the overview and the staff console". Measured, **that is
unsatisfiable at 1280 and 1646 whatever measure is chosen**, and not because of anything this epic
does: `/staff` and `/me/activity` render **outside the organisation shell**, so they have no Project
Explorer and their available region is **277px wider** than the nine org-scoped screens'. At 1646
today: org screens 1152, `my-activity` 1152 (region-limited nowhere), `staff` 1536, `org-home` 1369.
After D1 the org screens become region-limited at 1369 and `staff` stays 1536 — still 167px apart,
for a reason no measure can remove.

A condition that cannot pass is not a strict condition; it is one that will be quietly reinterpreted
at M8 by whoever is trying to ship. So it is split into the two things it was conflating:

|           | Condition                                                                       | Baseline today                                                    | Bar                                |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| **FC-1a** | Every in-scope screen's page frame computes the **same `max-width`**            | `1152px` × 9, `1536px` × 2 (`org-home`, `staff`) — **two values** | **one value**, at all three widths |
| **FC-1b** | Screens _sharing a shell region_ agree on rendered content width within **2px** | holds today                                                       | holds after                        |

`account` remains the declared exception and is measured as the control (`672px`, unchanged).

**Withdrawal clause:** none for FC-1a. FC-1b may exempt a screen only by moving it to the declared
exception list, in the same commit, with a reason.

---

## FC-2 — nothing wraps beside unused width

**Bar:** at 1280, 1646 and 1920, **zero** cells wrap in any in-scope table, except in columns
explicitly declared `auto`.

**Baseline (`column-fit-*.json`, pinned case passing):** **11 wrapping columns at 1646 and 11 at
1280**, from two causes the probe separates —

- _the cap is the problem_: Calendars and Project detail `Working days` (15px short, 271–359px of
  table slack), Resources `Code` (7px short, 518px slack);
- _the measure is the problem_: Audit log and My activity `When` / `Event` / `By` / `Subject`, no
  caps involved, table needs **1136** and has **1104**.

**Judged by:** `apps/web/scripts/measure-column-fit.mjs`, which **refuses a verdict** unless it can
still see the two known wraps. After M2 that pinned case is expected to fail — set
`EXPECT_KNOWN_WRAPS=0` **only then**, so the absence is the result rather than a broken instrument.

**Withdrawal clause:** a column that cannot meet this without truncating is declared `auto`, and the
exception is recorded with the content that forced it.

---

## FC-3 — the widening costs no screen width

**Bar:** monotonic non-regression. No in-scope screen's content width is smaller after than before,
at any of the three widths.

**Baseline — frame widths (content = frame − 48px):**

| Screen                | 1280     | 1646 | 1920 |
| --------------------- | -------- | ---- | ---- |
| `org-home`            | 1003     | 1369 | 1536 |
| the nine in-scope     | 1003     | 1152 | 1152 |
| `my-activity`         | **1152** | 1152 | 1152 |
| `staff`               | 1280     | 1536 | 1536 |
| `account` (exception) | 672      | 672  | 672  |

**Expected gain from D1:** `+0` at 1280 (the region already binds), **`+217` at 1646**, `+384` at 1920. The 1646 figure is the region, **not** the 1488 the spec attributed to it — see
`m0-measurement.md` §7, which corrects the spec's `+204`.

**Note the fourth inconsistency this table exposes:** at 1280, `my-activity` is **149px wider** than
the org-scoped screens, because it has no Explorer. It is currently the widest in-scope screen at
the narrowest measured width.

**Withdrawal clause:** none.

---

## FC-4 — every list sits in a framed section with an accessible name

**Bar:** every in-scope list screen's rows are inside a `<section>` carrying an accessible name.

**Baseline:** six screens have none — `clients`, `calendars`, `resources`, `audit-log`,
`recently-deleted`, `my-activity`. (`my-activity` was not named in the complaint and has the same
defect.)

**Judged by:** `page-frame.structural.test.ts`, extended.

**Withdrawal clause:** none.

---

## FC-5 — a focus ring is visible under forced colours

**Bar:** with `forced-colors: active`, focusing any control in the primitive census by keyboard
changes **at least one pixel** of its box.

**Baseline:** **zero pixels change.** Measured against the shipped stylesheet: the focus treatment
computes `outline: none 0px` and `box-shadow: none`, because forced-colors suppresses `box-shadow`
and Tailwind v4's `outline-none` emits `outline-style: none` (`m0-measurement.md` §4). The built CSS
contains **zero** `forced-colors` rules.

**Remedy confirmed to work, in a browser:** an **unlayered** `@media (forced-colors: active)` block
with a bare `:focus-visible` selector. It beats the layered utility despite losing on specificity,
because cascade layers are consulted first. No `!important`, no specificity matching, no
`revert-layer`.

**What M7 must still establish:** that a block written at the end of `globals.css` outside any
`@layer` actually compiles to an unlayered rule. That is a fact about the build, not the cascade,
and the remedy depends on it.

**Withdrawal clause:** none.

---

## FC-6 — reflow at 320px

**Bar:** at **320px CSS width**, every in-scope screen's `documentElement.scrollWidth ≤ clientWidth`.

**Baseline:** all nine in-scope screens and `account` overflow by **0px**. `staff` overflows by
**251px** and therefore **fails WCAG 2.2 §1.4.10 today** — pre-existing, not caused here, and
recorded so it is not later read as a regression.

**This condition has NO withdrawal clause, and M0 found the thing that will pull against it.**
Measured (`m0-measurement.md` §6b): a table whose columns are all `fit` (`w-px whitespace-nowrap`)
renders **793px wide inside a 320px container** — a 433px overflow — where the same content without
`fit` stays inside and wraps. `white-space: nowrap` has no fallback. **So `fit` must be applied
responsively**: shrink-to-fit from the breakpoint upwards, free to wrap below it.

---

## FC-7 — the design-system ratchets do not rise

**Bar:** the ADR-0097 weight ratchet and sizing ratchet do not increase.

**Judged by:** the existing gates, unchanged.

**Withdrawal clause:** none.

---

## FC-8 — nothing this epic adds pushes the first row below the fold

**Bar:** at 1646, no in-scope screen's first content row is pushed below the fold by anything added
here.

**Withdrawal clause:** a summary strip that pushes the list down is **withdrawn** — it has not
earned its place (decision 4).

---

## FC-9 — the detail counts cost a detail read little, and never scan a child table

**Added 2026-09-17, before the harness was built** (ADR-0128's ordering: the bar is committed in its
own commit, so it cannot be tuned to the answer). The epic's other eight conditions are all layout;
D3's child counts are the only work here that touches the API, and the product owner's answer to
that question was **"Yes — measure cost first"**, so the measurement is a requirement rather than a
courtesy.

`database-architect` returned **no schema change and no index** — every one of the four counts is
already served index-only by an index that exists for a different reason (the soft-delete-scoped
partial uniques on `(parent_id, name) WHERE deleted_at IS NULL`). This condition is what tests that
claim against the shipped code rather than against a design note.

**(a) Latency.** For `GET …/clients/:clientId` and `GET …/projects/:projectId`, **p95 < 50 ms** at
every shape below, and **added p95 ≤ 25 ms** over the same route without the counts. Before and
after in **one sitting**, 30 reps after 5 warm-up, with the **run-to-run spread reported beside each
delta** — a delta smaller than the spread is `INDETERMINATE`, not a pass.

**(b) Plan shape.** In `EXPLAIN (ANALYZE, BUFFERS)`, every count node is an `Index Only Scan`,
`Index Scan` or `Bitmap Index Scan` on one of those four indexes. **A `Seq Scan` on `projects`,
`plans` or `activities` fails FC-9 regardless of the timing** — and so does the disappearance of
`clients_organization_id_created_at_id_idx` from the clients **list** plan, which is the regression
the architect's finding 1 is about.

**(c) Estimated cost < 100,000** (`jit_above_cost`) at every shape.

(b) is the load-bearing limb and (c) is why: ADR-0144 records that a JIT cliff fires on a small
tenant **because a different tenant grew**, which no timing on one database can see. A plan-shape
condition survives that; a millisecond figure does not.

**Shapes.** The harness must **dilute** — the architect's own first probe reported every count as a
`Seq Scan`, an artefact of seeding one fat subject into a near-empty database, where a sequential
scan is genuinely the right plan. A harness that measures the seq-scan regime confirms nothing about
the index question.

| Shape       | Composition                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| deployed    | the real installation as found (124 clients / 4 projects / 17 plans / 29 activities) |
| typical     | 16 plans x 180 activities under one project                                          |
| fat client  | 500 projects x 12 plans under one client                                             |
| fat project | 60 plans x 2,000 = 120,000 activities under one project                              |

**Withdrawal clause:** if (a) or (b) fails, **the counts are withdrawn** and the detail screens are
enriched from fields already on the wire. Softening the bar is not an option; re-arguing it in
writing is.

> **JUDGED 2026-09-17 — three limbs PASS, one count WITHDRAWN.** `docs/specs/page-composition/m5/`
> holds the run. (a) worst route p95 **29.0 ms** against 50; (a) worst added **22.39 ms** against 25;
> (c) worst estimate **1,851** against 100,000; the clients LIST keeps
> `clients_organization_id_created_at_id_idx`. (b) fails on **one count of four**:
> `client.planCount` at the `fat client` shape plans as a `Seq Scan on projects` — 4.12 ms, and
> O(projects in the installation) rather than O(this client), which is the property this limb exists
> to refuse.
>
> **The clause is applied to the count that failed, which is an amendment made in writing rather
> than a softening.** As committed it reads "the counts are withdrawn", all four; three are
> index-only at every shape at 0.10–0.29 ms, with nothing to withdraw them for. So `client.planCount`
> goes and the other three stay. Two remedies exist — a query-shape change whose own cost is an
> unbounded `IN` list, and a candidate `projects (client_id) INCLUDE (id)` index which, unlike
> ADR-0144's rejected one, would **not** spend the HOT exemption — and both are filed with a trigger
> rather than guessed at.
>
> **Run 1 is not the verdict, and its third finding was the harness.** It reported the clients LIST
> plan as a `Seq Scan on clients` over a table holding **six rows**, where a sequential scan is
> obviously right — the dilution guard covered `projects`, `plans` and `activities` and not
> `clients`, so the regression limb was grading the instrument. Fixed, along with a missing `VACUUM`
> that had every index-only scan paying a heap fetch; both are measurement corrections, and the
> un-vacuumed figures are printed beside the judged ones so neither end of the range is hidden.

**What this condition deliberately does not cover.** The client to plans count has no stable plan:
swept against a 76,817-plan table it switches from a nested loop on `uq_plans_project_name` to a
hash join with a `Seq Scan on plans` somewhere between **75 and 100 projects under one client**. It
is a ratio, so it moves with the estate. Past the crossover the count is bounded by the installation
rather than by the client. The `fat client` shape exists to find where that sits today; the remedy,
if it is ever needed, is a **query-shape** change (resolve the project ids first and pass them as an
array — measured 0.232 ms against 2.85 ms for the join form), not an index.

---

## Two claims that were measured and turned out NOT to be defects

Recorded here because a condition written against a non-defect is worse than no condition, and
because both were expected to be findings.

1. **The clipped restore control on Recently deleted is not clipped.** Measured:
   `scrollWidth === clientWidth`, `overflow: visible`, `text-overflow: clip`, `max-width: none`. The
   `…` is **literal text in the source** (`RecentlyDeletedTable.tsx:257`, `Restore {name} first…`) —
   the standard convention for a control that opens a further step, and `RestoreAncestorDialog` is
   that step. **No CSS remedy is owed.** What is owed is the observation that the convention reads
   as truncation on this screen, because a long name sits in the middle of the sentence.

2. **The audit filter bar does not overflow.** The spec quoted "~246px over at every width" forward.
   Measured: `overflowsBy: 0` at 1280, 1646 and 1920. It **wraps onto three lines and stands 122px
   tall**; its children need 1194px against a 1104px bar at 1646/1920 (90px over) and 955px at 1280
   (239px over). So the figure was wrong in two ways — it is not constant across widths, and the bar
   resolves the shortfall by growing downwards rather than sideways. The defect is **122px of
   vertical chrome above the table**, which is a different problem with a different remedy.
