# M0 — the organisation landing, measured before anything was built

**Status:** Approved

Every figure this epic will be judged on, taken in a real browser against the real product before a
line of the design was written. Two readings an hour apart, on two different seeded organisations,
so the run-to-run spread is a number in the record rather than an assumption (ADR-0128: an
instrument whose spread exceeds its own bar cannot answer, and one whose spread is unreported
cannot be checked).

|             |                                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| **Taken**   | 2026-09-15T10:02:53Z and 10:03:25Z                                                 |
| **Build**   | `web 0.131.0 · api 0.64.0`, read off the shell footer by the harness — not assumed |
| **Harness** | `apps/web/scripts/measure-overview.mjs`                                            |
| **Fixture** | `apps/web/scripts/landing-fixture.mjs`, seeded through the public REST API         |
| **Control** | `assertLandingStates` — PASS, 9 states asserted positively, before any measurement |

---

## 0. The control discriminates, and was verified red first

`apps/web/scripts/verify-landing-control.mjs` runs the SHIPPED `seed()` verbatim and asks the
control about those real plans — so every absence it reports is "this plan is not in that state",
never "no such row", which would be a red run about nothing.

```
The landing fixture cannot exhibit 8 of 9 states, so nothing measured against it means anything:
  - ABSENT: §5.2 row 1 — a calculated plan whose finish moved LATER than its active baseline
  - ABSENT: §5.2 row 5 — a calculated plan with an active baseline it has NOT moved against
  - ABSENT: §5.2 row 2 — a plan EDITED SINCE it was calculated
  - ABSENT: §5.2 row 4 — a plan carrying a CONSTRAINT VIOLATION the engine flagged
  - ABSENT: §5.2 row 6 — a plan with NO ACTIVITIES
  - ABSENT: one LIVE invitation (pending, not yet expired)
  - ABSENT: one EXPIRED invitation — still PENDING, which is the defect CQ-2 is about
  - ABSENT: more plans in the project than the section cap of 8, so "showing N of M" renders at all
```

**8 of 9, and the ninth is the finding.** "Never calculated" PASSES against `main`'s seed, because
that seed recalculates nothing — so the state is **ambiently true** of the old fixture. Phrased the
way a non-vacuity control is usually phrased — "some plan has never been calculated" — it would have
been satisfied by a fixture that can exhibit nothing else, and every figure below would have been
reported over a page with nothing to say. That is ADR-0143 §11's finding, predicted by this epic's
own spec and then observed. It is the whole argument for the control naming **specific plan ids**.

---

## 1. FC-1 — is each question answered above the fold at 1646 × 1000?

Both readings, identical:

| Q   | Question                                  | Answering element                                       |      `y` | Above the fold? |
| --- | ----------------------------------------- | ------------------------------------------------------- | -------: | --------------- |
| Q1  | Where was I?                              | `a` — "Dockside — Quay Wall Reconstruction"             |      238 | **yes**         |
| Q2  | What changed while I was away, and who?   | `a` — "Dockside — Ancillary works 6"                    |      442 | **yes**         |
| Q3  | Is anything waiting on me?                | `a` — "Dockside — Lock Gate Refurbishment"              | **1053** | **no**          |
| Q4  | Are these figures current, or stale?      | absent — region present, no `[data-overview-freshness]` |        — | **no**          |
| Q5  | When does each programme finish?          | absent — region present, no `[data-overview-finish]`    |        — | **no**          |
| Q6  | Has that moved against what we committed? | absent — region present, no `[data-overview-variance]`  |        — | **no**          |
| Q7  | Is anything flagged in the schedule?      | absent — region present, no `[data-overview-flags]`     |        — | **no**          |

### FC-1 baseline: **2 of 7**. Bar for the after run: 7 of 7.

**The spec predicted 3 and the measurement says 2, and the difference is not a rounding.**
`feature-spec.md` §5.1 wrote "Baseline: taken at M0 against the shipped screen (Q1–Q3 only)" —
reasoning from the §4 table, which classes Q3 as **"Answered today, one row wrong"**. It is answered
today. It is answered at **y = 1053**, fifty-three pixels below the fold on the product owner's own
screen, so a returning user does not see it without scrolling. Both halves of that sentence are
true and only one of them was written down, which is the ordinary shape of an unmeasured claim
(ADR-0076 Class 3). The correction makes the epic's case stronger, not weaker: the one question the
spec agreed was already answered is answered somewhere the reader has to go looking.

> **Q3's position depends on Q1 being present**, and the harness opens a plan before measuring
> precisely so that it is. A freshly-onboarded account has no "Jump back in" section, which moves
> everything above Q3 up by ~200 px and would have scored Q3 as passing. That is the state no
> returning user is ever in, and measuring it would have given M5 credit for fixing a section that
> already worked. The harness says so at its call site.

---

## 2. FC-4 — each section's rendered content width

Content width, not border box: padding is chrome, and a section that keeps its box and loses its
padding has been narrowed in the only sense a reader notices.

| Width | Jump back in | Recently changed | Needs your attention |
| ----: | -----------: | ---------------: | -------------------: |
|  1646 |          846 |              846 |                  846 |
|  1440 |          846 |              846 |                  846 |
|  1280 |          846 |              846 |                  846 |

**The page does not respond to width at all.** 846 px at 1646, at 1440 and at 1280 — so at the
product owner's width roughly half the window is unused down the page's whole length. This is
ADR-0143's staff-console finding (848 px at three widths) on a second screen, reached independently,
which makes it a property of `PageContainer width="narrow"` rather than of either screen.

**Bar for the after run: each section `>=` 846.** CQ-3's two-column grid is gated on this, and
withdrawn to a stacked layout if any section comes back narrower.

---

## 3. FC-5 — requests to `…/overview` on one landing load

**1** (bar: exactly 1). Counted with ADR-0098's own guard: the Vite dev server also serves
`/src/features/overview/…`, which once made this count read 19, so only the versioned API route
counts.

---

## 4. Run-to-run spread

**Zero, on every figure.** Two runs, two different organisations, every `y` and every width
identical to the pixel. That is what makes a later delta meaningful: there is no noise floor to
clear, so any movement after the build is the build.

---

## 5. Three instruments were wrong before any product figure was taken

Recorded because in this repository the instruments have been wrong more often than the code, and
each of these printed a plausible number.

1. **`[role="region"]` matched nothing, and the harness reported `FC-1: 0 of 7`.** `SectionCard`
   renders `<section aria-labelledby>` (`section-card.tsx:65-67`), which **is** a region — a
   `<section>` with an accessible name has that role **implicitly**, and there is no `role`
   attribute in the DOM to match. The approved plan's own risk line said to locate sections "by
   `role=\"region\"` + accessible name (`SectionCard` renders named regions)": half right, and the
   wrong half is invisible. The `<h1>` guard did **not** catch it, because the harness had reached
   the right screen and was asking the wrong question about it — a guard against the wrong page is
   not a guard against the wrong selector. (Playwright's `getByRole('region')` computes implicit
   roles and would have found them; a CSS attribute selector inside `page.evaluate` does not.)

2. **The spec's description of the fixture it was replacing was wrong in both content and every
   citation.** §0.7 said "two plans, one of them empty … one plan of 10 activities" at `:420`,
   `:253-351` and `:368-385`. `seed()` is at `shoot.mjs:199-228` and creates **three** plans of one
   activity each, recalculating none; `seedEmptyPlan` is real but belongs to a different shot and
   never runs for `org-home`. Corrected in place rather than dropped, because the correction
   **changes a design fact** — it is why "never calculated" is ambiently true above.

3. **M0-T3's stated mitigation could not be obeyed.** It said the harness should "refuse to run
   while anything answers on 3000 or 5173". That belongs to `scripts/e2e-local.sh`, which STARTS its
   own servers; this harness drives the running ones, so obeying it would make it unable to run at
   all. The risk is real (ADR-0099's three false diagnoses came from a silently-adopted stale
   server), so it is answered the other way: the harness **reads the build off the shell footer**
   and prints it in every report. A stale server then shows up as a wrong version number in the
   record rather than as a refusal — and unlike a refusal, it is still true when somebody reads the
   report next month. ADR-0142 D4: a remedy is measured before it is built.

---

## 6. One departure from the public API, stated because it is the only one

Ageing an invitation past `expiresAt` is a direct `UPDATE`. `INVITATION_TTL_MS` is seven days
(`invitations.service.ts:27`) and nothing in the request body moves it, so an expired invitation is
unreachable through the product. The row is left `PENDING`, which is not a contrivance but **the
state the defect lives in**: `findManyPendingByOrg` (`invitation.repository.ts:48-54`) filters on
`status` and never reads `expires_at`, so an invitation `accept()` will refuse with "This invitation
has expired." (`invitations.service.ts:217-219`) is still counted and still listed. That is the
sentence the product owner queried, reproduced.

---

## 7. What the shipped screen looks like

`.screenshots/1646/org-home.png`, taken in the same session. Two things the numbers above do not
say, recorded for M5 rather than acted on here:

- **The six plans this epic reports on are almost entirely absent from "Recently changed"**, which
  is filled by the six filler plans — every row `Draft`, every row "just now", nothing
  distinguishing a programme that has slipped from one nobody has opened.
- **"Needs your attention" is answering about locks the reader holds themselves** ("You are holding
  the editing lock", three times). That is the seed taking the pen and never releasing it, so it is
  a fixture artefact rather than a product defect — but it is also what the section says on a real
  screen whenever somebody leaves a plan open, and §0.1's invitation row is the other occupant.

---

## 8. FC-2 and FC-3 — the endpoint, measured for the first time

Harness: `apps/web/scripts/measure-overview-endpoint.mjs`. Taken 2026-09-15T10:09Z, 30 reps after 5
warm-up per shape. The full `EXPLAIN (ANALYZE, BUFFERS)` for each shape is in that run's output.

ADR-0098's index migration measured the recently-changed QUERY exhaustively and closes with "**The
endpoint was not measured, only this query.**" This is that measurement. The four shapes are that
migration's own, taken from its table rather than invented.

### FC-2 — latency (bar: p95 < 200 ms)

| Shape                 | Plans | Activities | Rows |  p50 |  **p95** | min–max   | Verdict  |
| --------------------- | ----: | ---------: | ---: | ---: | -------: | --------- | -------- |
| typical installation  |    16 |      2,880 |    8 | 17.5 | **24.3** | 14.6–54.2 | **PASS** |
| scale tier (ADR-0066) |    10 |     20,000 |    8 | 17.6 | **23.2** | 14.4–24.0 | **PASS** |
| breadth               |   459 |     18,360 |    8 | 19.4 | **29.6** | 15.1–34.7 | **PASS** |
| extra-large           | 3,000 |    120,000 |    8 | 38.4 | **43.2** | 32.1–45.1 | **PASS** |

**The headroom is the number M4 turns on: 156.8 ms at the worst shape.** R3 is gated on FC-2 holding
after it lands, and this says how much there is to spend.

**Read the spread before reading a later delta.** At the typical shape the samples run 14.6–54.2 ms
— a 39.6 ms range, WIDER than the gap between p50 at the typical shape and p50 at extra-large. So a
post-build delta under ~40 ms at that shape is **INDETERMINATE**, not a pass (ADR-0128's fourth
verdict). The three larger shapes are much tighter (12.8, 19.6 and 13.0 ms), which is the usual
shape of a first-request outlier rather than of noise throughout.

### FC-3 — no JIT cliff (bar: no `JIT:` node, estimated total cost < 100,000)

| Shape                 | Estimated total cost | `jit_above_cost` | `JIT:` node? | Verdict  |
| --------------------- | -------------------: | ---------------: | ------------ | -------- |
| typical installation  |                  106 |          100,000 | no           | **PASS** |
| scale tier (ADR-0066) |                   75 |          100,000 | no           | **PASS** |
| breadth               |                2,256 |          100,000 | no           | **PASS** |
| extra-large           |               15,299 |          100,000 | no           | **PASS** |

Three orders of magnitude below the threshold at every shape, and the extra-large estimate (15,299)
is the one to watch: it is the only shape within one order of magnitude of the cliff, and it is the
shape R3's extra work would land on hardest. The migration's own finding is that JIT began firing on
a **small** tenant because a **different** tenant grew, so this is deliberately an estimate condition
— a timing on one database structurally cannot see that.

### Two things the benchmark found about itself

1. **The endpoint is behind the global throttle, and the benchmark paces.** `RATE_LIMIT_LIMIT=100`
   per `RATE_LIMIT_TTL=60` s per IP (`app.module.ts:99-104`, `.env:28-29`). The first run fired
   (30 + 5) × 4 = 140 requests as fast as they would go and the **third** shape came back
   `429 RATE_LIMITED`, having measured two and refused the one the epic most needs. It is **not
   retried** — a retried 429 reports the latency of a request that was refused once and accepted
   later, which is a latency nobody experiences. It paces at 660 ms and says so in its own header,
   so no reader can mistake these for back-to-back figures.

2. **The benchmark grows this database permanently, which matters for the AFTER run.** It leaves
   ~161,000 activities across four organisations. ADR-0098's recorded finding is that a tenant's
   landing page gets slower **because a different tenant grew**, so an after-run taken against a
   database this one has already grown is not comparable with a before-run taken against a smaller
   one. That is exactly why FC-2 requires before and after **in one sitting**, and why the after run
   must seed its own fresh shapes rather than re-measure these organisations.

### Where it bypasses the product, stated rather than implied

Organisations, clients and projects are created through the public REST API. **Plans and activities
are bulk-inserted in SQL**, because 3,000 plans × 40 activities is ~123,000 REST writes and a
harness nobody re-runs is a harness that measures nothing. Those rows are therefore **not** evidence
that any write path works, and nothing here claims they are — they exist to give the planner a table
to plan against, which is what FC-2 and FC-3 are about (ADR-0081's rule: a harness says in its own
docblock where it bypasses the product).
