# Implementation Plan: The page grid splits on the width it has (#333)

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md)
- **Status:** Draft — awaiting approval
- **Owner:** web

## Breakdown

```mermaid
flowchart LR
  E[Epic: PageGrid container split] --> M0[M0 measure before] --> M1[M1 the split + journey] --> M2[M2 measure after, close #333]
```

### Epic

**PageGrid splits on its own width** — ADR-0179 follow-up; closes `docs/TECH_DEBT.md` #333.
**Size: S** overall (one primitive, one screen class, one ADR, tests). No flag (ADR-0088 D1).

---

### Milestone M0: Measure before (S)

**Outcome:** the "before" record and the photographs that answer CQ-2.
**Ships dark:** measurement only; no product change.

##### Task M0-T1 — Before readings and photographs

- **Description:** extend `apps/web/scripts/measure-overview.mjs` (its `WIDTHS` is
  `[1646, 1920, 1440, 1280]`, `:41`; photographs at 1920/1646/1280 only, `:355`) with **1024 × 600,
  1280 × 800, 1358 × 636, 1440 × 900, 1912 × 948, 1912 × 1114**, and two Explorer states (folded;
  420) at 1280 and 1440. Record per cell: grid width, track widths, distinct region tops, `<main>`
  scroll height, document overflow. Photograph the landing at every cell; Members at 1024, 1280,
  1440, 1912.
- **Complexity:** S · **Dependencies:** — · **Risks:** container Chromium is not the target hardware
  → layout only, no frame claims; a harness change is a script, not a Playwright config (no ADR-0105
  trigger).
- **Testing:** n/a (instrument). Non-vacuity: every cell must find four named regions. The harness
  today only **prints** "no named regions found" (`:288`); M0 makes that exit non-zero.
- **Development steps:** extend the harness; run it once against the seeded fixture; write
  `docs/specs/landing-two-columns/m0-measurement.md` with the table and the shot list; put the
  1358 and 1440 photographs in front of the product owner for CQ-2.

---

### Milestone M1: The split moves to the grid's own width (S)

**Outcome:** at 1024–~1348 (Explorer default) the landing and Members read as one column; at 1912
nothing changes.
**Entry point:** the organisation landing, `/orgs/$orgSlug` — the screen every sign-in lands on
(and Members, Explorer → **Members**).
**Journey:** `e2e-overview/overview.spec.ts` step 5b gains a 1280 × 800 assertion (four regions,
four distinct tops) beside the existing 1600 × 1000 one (two distinct tops, `:108-123`), plus a
fold-the-Explorer step at 1280 asserting two distinct tops (SC-3).

#### Feature: container-split `PageGrid`

> **Description:** spec §4.4.
> **Complexity:** S
> **Dependencies:** M0; spec approved with CQ-1 and CQ-2 answered; ADR filed.
> **Risks:** see rollup R1–R5.
> **Testing requirements:** unit (structural), the journey above, `scripts/e2e-local.sh web:overview`
> and `web:page-composition` locally (the builder, not this analyst), axe on the landing at 1280.

##### Task M1-T1 — ADR

- **Description:** file the short ADR outlined in spec §4.6 at the next free number; one line in
  CLAUDE.md §16 (`check:adr-coverage`).
- **Complexity:** S · **Dependencies:** approval · **Risks:** number collision with an in-flight
  branch → take the number at filing.
- **Testing:** `pnpm check:adr-coverage`.

##### Task M1-T2 — `PageGrid` and the landing (one PR with T1)

- **Description:** frame + `@5xl:grid-cols-2`; `frameClassName`; `col-span-full`; landing row
  template to `@5xl:`; docblocks at `page-grid.tsx:20-58` and `OverviewScreen.tsx:229-231`.
- **Complexity:** S · **Dependencies:** T1.
- **Risks:** R1 (height chain), R2 (coupling drift).
- **Testing:**
  1. `page-grid` unit: the `@container` is on a wrapper and the split variant on the grid (the
     `page-archetypes.test.tsx:345-359` pattern for `StatGrid`); `wide` emits `col-span-full`.
  2. A structural test reading `page-grid.tsx` and `OverviewScreen.tsx`: the landing's row-template
     variant uses **the same container size** as the split. Verified red by setting one to `@6xl`.
  3. `page-grid.structural.test.ts` and `container-query.structural.test.ts` stay green unedited.
  4. The M1 journey; existing landing, Members and staff unit suites pass unedited (they query by
     role and name, `m6-two-column.md:128-130`).
- **Development steps:**
  1. Write the two unit tests red.
  2. Change `page-grid.tsx`; then `OverviewScreen.tsx`.
  3. Add the journey assertions; run `pnpm prepush` and the two `e2e-local.sh` suites.
  4. Changeset (`@repo/web`, patch: user-visible layout change).
  5. Run **component-reviewer** and **accessibility-reviewer** on the diff (shared primitive; R4).

---

### Milestone M2: Measure after, and close the row (S)

**Outcome:** the after-record, #333 closed with evidence.
**Ships dark:** documentation; M1 is the user-visible change.

##### Task M2-T1 — After readings

- **Description:** re-run M0's harness on the shipped tree in one sitting with a fresh "before" from
  the parent commit; judge SC-1…SC-4; product owner judges SC-5 from the photographs.
- **Complexity:** S · **Dependencies:** M1 merged.
- **Development steps:** write `m2-after.md`; close `docs/TECH_DEBT.md` #333 with the citation; mark
  `minimum-viewport/implementation-plan.md:358` taken; add a forward note to
  `m6-two-column.md` §4; hand-off line: "the Surface upright shows the landing in one column".

## Sequencing & slices

M0 → M1 → M2. M0 and M2 change no product behaviour. M1 is one PR, revertible as one commit — that
is the rollback (ADR-0088 D1). If CQ-1 is answered "landing only", M1-T2 adds `split?: 'md' |
'measure'` defaulting to `md` and only `OverviewScreen` passes it; everything else is unchanged.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in
[`docs/PROCESS.md`](../../PROCESS.md) (code, tests, docs, security, performance, accessibility,
Docker build, CI, changelog, version impact).

## Risks & assumptions (rollup)

| #   | Risk / assumption | Likelihood | Impact | Mitigation |
| --- | ----------------- | ---------- | ------ | ---------- |
| R1  | The new frame breaks the landing's height chain (`PageContainer` → `:196` flex column → grid), so the M9 cap stops binding at 1912 | med | med | `frameClassName="min-h-0 flex-1"` + grid `flex-1 min-h-0`; SC-2 compares tracks **and** box heights at 1912 × 948 against M0 |
| R2  | The split and the landing's row template drift apart later | med | med | The coupling test (M1-T2 step 2), verified red |
| R3  | `container-type: inline-size` collapses the frame (the `plan-facts.tsx:109-114` failure) | low | high | The frame is block-level or a stretched column-flex child at all three sites; SC-1/SC-2 measure the frame's width, not just the tops |
| R4  | In one column the landing's `fill` bodies keep `tabIndex={0}` but do not scroll — a purposeless tab stop, now in the designed range | med | low | Already true below `md`; accessibility-reviewer decides whether to gate `tabIndex` on overflow — a separate row if so, not this PR |
| R5  | `/staff` changes in 1024–1071 with no measured staff tracks (`table-wrap-coverage/m2/README.md:133-137`) | low | low | Derived only; staff screens are 1912. Stated, not hidden |
| R6  | Single-column landing at 1280 pushes "Where the work stands" below the fold on a 1280 × 800 window (FC-1 has only ever been judged at 1646/1920) | high | low | Accepted trade: readable rows over above-the-fold count in a band the product owner does not use; M0/M2 record the count so it is a number, not a guess |
| A1  | 500 px columns read comfortably | — | — | CQ-2, decided on M0's photographs |
