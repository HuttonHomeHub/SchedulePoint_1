# Implementation Plan: The page grid splits on the width it has (#333)

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md)
- **Status:** Approved 2026-10-08 by the product owner, recommendations accepted: CQ-1 change the default for all three pages. CQ-2 (the 64rem vs 72rem split) stays decided by the M0 photographs and the SC-6 rule, and M1 does not start before it.
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
  1280 × 800, 1349 × 800, 1358 × 636, 1440 × 900, 1477 × 900, 1912 × 948, 1912 × 1114**, and two
  Explorer states (folded; 420) at 1280 and 1440. Record per cell: grid width, track widths,
  distinct region tops, `<main>` scroll height, document overflow, and **how many boxes are wholly
  visible without scrolling**. Photograph the landing **and Members** at every cell. 1349 and 1358
  are the narrowest pairs under `@5xl`; 1477 is the narrowest under `@6xl`.
- **Complexity:** S · **Dependencies:** — · **Risks:** container Chromium is not the target hardware
  → layout only, no frame claims; a harness change is a script, not a Playwright config (no ADR-0105
  trigger).
- **Testing:** n/a (instrument). Non-vacuity: every cell must find four named regions. The harness
  today only **prints** "no named regions found" (`:288`); M0 makes that exit non-zero.
- **Development steps:** extend the harness; run it once against the seeded fixture (seed a long
  plan name and a long `project · client` pair, or SC-6 is vacuous); write
  `docs/specs/landing-two-columns/m0-measurement.md` with the table and the shot list; **judge SC-6
  on the 1349/1358 photographs** and put the verdict and the photographs in front of the product
  owner. **CQ-2 is blocked until this is done, and M1 does not start before it.**

---

### Milestone M1: The split moves to the grid's own width (S)

**Outcome:** at 1024–~1348 (Explorer default) the landing and Members read as one column; at 1912
nothing changes.
**Entry point:** the organisation landing, `/orgs/$orgSlug` — the screen every sign-in lands on
(and Members, Explorer → **Members**).
**Journey:** `e2e-overview/overview.spec.ts` step 5b gains a 1280 × 800 assertion (four regions,
four distinct tops) beside the existing 1600 × 1000 one (two distinct tops, `:108-123`), plus a
fold-the-Explorer step at 1280 asserting two distinct tops (SC-3). In both layouts it asserts the
section headings' DOM order equals the Tab order across them, that focus is still on the fold
button after the grid reflows, and it runs axe (naming `scrollable-region-focusable` and `region`)
in each state (SC-5). A 1280 × 800 step at root font 200 % asserts no horizontal document overflow
(SC-4). **These Playwright steps are the behaviour tests**: jsdom evaluates no container query.

#### Feature: container-split `PageGrid`

> **Description:** spec §4.4.
> **Complexity:** S
> **Dependencies:** M0 (SC-6 judged); spec approved with CQ-1 and CQ-2 answered; ADR filed.
> **Risks:** see rollup R1–R5.
> **Testing requirements:** unit (structural), the journey above, `scripts/e2e-local.sh web:overview`
> and `web:page-composition` locally (the builder, not this analyst), axe on the landing at 1280.

##### Task M1-T1 — ADR

- **Description:** file **ADR-0182** (outlined in spec §4.6; number reserved); one line in
  CLAUDE.md §16 (`check:adr-coverage`).
- **Complexity:** S · **Dependencies:** approval · **Risks:** none; 0182 is reserved (0180,
  0181 and 0183 belong to other in-flight specs).
- **Testing:** `pnpm check:adr-coverage`.

##### Task M1-T2 — `PageGrid` and the landing (one PR with T1)

- **Description:** spec §4.4 — the frame (`@container flex min-h-0 flex-1 flex-col` + caller
  `className`); the grid inside with no public override; `rows?: 'auto' | 'fit-then-fill'`;
  `col-span-full`; the landing passes `rows="fit-then-fill" className="min-h-0 flex-1"`. Rewrite
  the docblocks at `page-grid.tsx:20-58` (the `:49-50` rule in particular) and delete
  `OverviewScreen.tsx:229-231`'s "only from `md`" comment with the class it explained.
- **Complexity:** S · **Dependencies:** T1.
- **Risks:** R1, R3 (closed by construction, still measured), R7.
- **Testing:** the unit file's header says plainly that **jsdom does not evaluate container
  queries**, so these tests pin the classes and the Playwright steps (SC-1, SC-3) are the behaviour
  tests.
  1. `page-grid` unit: the `@container` is on the frame and `@5xl:grid-cols-2` on the grid (the
     `page-archetypes.test.tsx:345-359` pattern for `StatGrid`); `className` lands on the frame;
     `rows="fit-then-fill"` adds `@5xl:grid-rows-[minmax(0,auto)_minmax(0,1fr)]` and `'auto'` adds
     none.
  2. `page-grid.structural.test.ts` extended, scanning the comment-stripped source as it already does
     (`:47-49`): `@5xl:grid-cols-2` present; `col-span-full` present for `wide`; **no `md:` or `lg:`
     variant anywhere in the file**; every container variant in the file uses the same size.
     **Verified red** by mutating one occurrence to `@6xl`.
  3. `container-query.structural.test.ts` stays green unedited.
  4. The M1 journey; existing landing, Members and staff unit suites pass unedited (they query by
     role and name, `m6-two-column.md:128-130`).
  5. R7 scan, re-run at M1: `grep -nwE "fixed|absolute"` over `features/overview`,
     `features/members`, `features/staff/ui` and `components/ui/page` finds no positioned class.
- **Development steps:**
  1. Write the unit and structural tests red.
  2. Change `page-grid.tsx`; then `OverviewScreen.tsx`; re-grep `COMPONENT_LIBRARY.md`,
     `DESIGN_SYSTEM.md`, `UX_STANDARDS.md` for a `PageGrid`/`md` statement (none on 2026-10-08).
  3. Add the journey assertions; run `pnpm prepush` and the two `e2e-local.sh` suites.
  4. Changeset (`@repo/web`, patch: user-visible layout change).
  5. Run **component-reviewer** and **accessibility-reviewer** on the diff (shared primitive; R4).

---

### Milestone M2: Measure after, and close the row (S)

**Outcome:** the after-record, #333 closed with evidence.
**Ships dark:** documentation; M1 is the user-visible change.

##### Task M2-T1 — After readings

- **Description:** re-run M0's harness on the shipped tree in one sitting with a fresh "before" from
  the parent commit; judge SC-1…SC-6. **Add one reading at ~1272 × 1800** (the Surface upright,
  `minimum-viewport/feature-spec.md:422`; the height is an estimate until the product owner reads
  `/pointer-check.html` upright): how many of the four boxes are wholly visible without scrolling,
  before and after.
- **Complexity:** S · **Dependencies:** M1 merged.
- **Development steps:** write `m2-after.md`; close `docs/TECH_DEBT.md` #333 with the citation; mark
  `minimum-viewport/implementation-plan.md:358` taken; add a forward note to
  `m6-two-column.md` §4; hand-off line: "the Surface upright shows the landing in one column — N of
  4 boxes visible".

##### Task M2-T2 — Register follow-ups (docs only)

- **Description:** file three `docs/TECH_DEBT.md` rows; fix none of them here.
  1. **`SectionCard fill` body is a tab stop whether or not it scrolls** (`section-card.tsx:263`).
     Not an AA failure. Scope: make `tabIndex={0}` conditional on real overflow, and give the body
     the design-system focus ring it lacks today (`section-card.tsx:251` has none; the ring is
     `focus-visible:ring-ring focus-visible:ring-2`, as in `input.tsx:19`). A shared-primitive
     keyboard change, so it earns accessibility-reviewer before release (CLAUDE.md §19.13).
  2. `routes/members.tsx:15-18` states the stale `max-w-6xl` default.
  3. `docs/HANDOFF.md:38` no longer holds the 1912 × 1114 reading ADR-0179:53 cites.
- **Complexity:** S · **Dependencies:** — (can land with M2-T1).

## Sequencing & slices

M0 → M1 → M2. M0 and M2 change no product behaviour. M1 is one PR, revertible as one commit — that
is the rollback (ADR-0088 D1). If CQ-1 is answered "landing only", M1-T2 adds `split?: 'md' |
'measure'` defaulting to `md` and only `OverviewScreen` passes it; everything else is unchanged.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in
[`docs/PROCESS.md`](../../PROCESS.md) (code, tests, docs, security, performance, accessibility,
Docker build, CI, changelog, version impact).

## Risks & assumptions (rollup)

| #   | Risk / assumption                                                                                                                                                                                                                                        | Likelihood | Impact  | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The new frame breaks the landing's height chain (`PageContainer` → `:196` flex column → frame → grid), so the M9 cap stops binding at 1912                                                                                                               | low        | med     | Closed by construction: the frame is always `flex min-h-0 flex-1 flex-col` and the grid `min-h-0 flex-1`, with no override to get wrong. SC-2 still compares tracks **and** box heights at 1912 × 948 against M0                                                                                                                                                                                                                                                                                                                                                                             |
| R2  | The split and the row template drift apart later                                                                                                                                                                                                         | low        | med     | Closed by construction: both are emitted by `page-grid.tsx`; the structural test requires one container size throughout the file, verified red with `@6xl`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R3  | `container-type: inline-size` collapses the frame (the `plan-facts.tsx:109-114` failure)                                                                                                                                                                 | low        | high    | The frame's parent is a stretching column flex (landing) or block flow (Members, staff) — spec §4.4 table; SC-1/SC-2 measure the frame's width, not just the tops                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R4  | In one column the landing's `fill` bodies keep `tabIndex={0}` but do not scroll — a purposeless tab stop, now in the designed range                                                                                                                      | med        | low     | Not an AA failure; already true below `md`. Filed as its own row (M2-T2 item 1): conditional `tabIndex` + the focus ring the body lacks                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R5  | `/staff` changes in 1024–1071 with no measured staff tracks (`table-wrap-coverage/m2/README.md:133-137`)                                                                                                                                                 | low        | low     | Derived only; staff screens are 1912. Stated, not hidden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R6  | In one column the lower boxes fall below the fold — at 1280 × 800, and on the **product owner's Surface used upright (~1272 wide), which is a real user of this band**. FC-1 has only ever been judged at 1646/1920                                      | high       | low–med | **Accepted knowingly**: readable rows over above-the-fold count. Upright the window is tall, so a single column costs less there than on a laptop. M0 and M2 record boxes-visible at 1280 × 800 and ~1272 × 1800 so the cost is a number; if the product owner finds it worse upright, that is a new row, not a reversal of this one                                                                                                                                                                                                                                                         |
| R7  | `container-type: inline-size` applies **layout containment**: the frame becomes the containing block for `position: fixed`/`absolute` descendants and a new stacking context, so a non-portalled overlay inside a section would be clipped or mis-placed | low        | high    | `Menu` and `Tooltip` portal to `body` with `position: fixed` (`menu.tsx:244-253`, `tooltip.tsx:389-397`). **Scanned 2026-10-08**: `grep -wE "fixed\|absolute"` over `features/overview`, `features/members`, `features/staff/ui` and `components/ui/page` (`*.tsx`) finds **no positioned class** — every hit is prose ("fixed version", "fixed id"). Requirement: nothing inside a `PageGrid` renders a non-portalled `fixed`/`absolute` overlay; re-scanned at M1 (M1-T2 test 5). The scan does not see primitives imported from elsewhere, other than the two above (stated, not implied) |
| A1  | 500 px columns read comfortably                                                                                                                                                                                                                          | —          | —       | SC-6, judged on M0's 1349/1358 photographs; `@6xl` if it fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
