# Implementation Plan: `CheckboxField` adoption (`docs/TECH_DEBT.md` #72)

- **Spec:** [`feature-spec.md`](feature-spec.md) — Approved by the product owner, 2026-10-21, with all
  defaults. Both milestones ship in one PR.
- **Shape:** one epic, two milestones, one PR each; `main` stays releasable after either.
  Frontend only: no schema (database-architect not needed), no API, no flag (ADR-0088 D1).
- **Changeset:** `@repo/web` **patch** in M1 ("selection checkboxes use the shared checkbox
  primitive; no visible change").

## Epic — one checkbox primitive

### M1 — Widen `CheckboxField`; move the selection column (complexity: S)

- **T1.1 Primitive** (`components/ui/form.tsx:252-357`). Add `labelHidden?: boolean` and
  `targetData?: Record<\`data-${string}\`, string>`to`CheckboxFieldProps`; in hidden mode wrap
`label`in`<span className="sr-only">`, give the `<label>`the 24/44 hit-box classes, skip`<FieldGateLock />`. Update the docblock (what each prop is for, and why `className` is not
  offered on the label).
  - Steps: props + docblock → branch the label className → spread `targetData` on `<label>`.
  - Tests (`form.test.tsx`): default render's DOM snapshot unchanged (FR-5, written **before** the
    change, so it is verified against the old output); hidden mode → `getByRole('checkbox',
{ name })` resolves, no `aria-label` attribute, label carries `size-6` and
    `pointer-coarse:size-(--control-h)` and the passed `data-*`; hidden + shut gate → `aria-disabled`,
    click cancelled, reason linked, no lock icon. `field-gate.structural.test.ts` still green.
- **T1.2 Adopt** in `ActivitiesTable.tsx:139-151` and `:197-208`: `CheckboxField labelHidden
targetData={{ 'data-row-select': '' }}`, same names, `indeterminate` via the forwarded ref. Fold
  the two `#72` comment blocks (`:127-138`, `:184`) into one pointer at the primitive.
  - Tests: `ActivitiesTable.bulk-assign.test.tsx` unchanged and green (it queries by name);
    `wbs.spec.ts:91` diagnostic reads the accessible name (`el.labels?.[0]?.textContent`) instead of
    `aria-label`.
- **Dependencies:** none. **Risks:** the select-all's tri-state (mitigated: ref is forwarded, unit
  test asserts `indeterminate`); the wrapping `div` adding height in the header cell (mitigated: the
  coarse sweep in `command-surface.spec.ts:2776` and the 24×24 pin both measure it).
- **E2E suites to run locally** (`scripts/e2e-local.sh web:<suite>`):
  - `e2e-wbs` — `wbs.spec.ts:87-101` (24×24 pin), `support.ts:249` (`rowCheckbox` by
    `Select ${name}`, used throughout).
  - `e2e-workspace-fit` — `command-surface.spec.ts:275`, `:2448`, `:2776` (`[data-row-select]`
    fine/coarse target sweeps).
  - `e2e-workspace-chrome` — `activities-panel-scroll.spec.ts:343` (`Select Activity 01`).
  - No e2e names `Select all activities`; covered by the unit suite.
- **Reviews before ship:** component-reviewer, accessibility-reviewer (name source moved from
  `aria-label` to label text — reviewer confirms with a real browser, not jsdom).

### M2 — Move `TsldViewControls`; close #72 (complexity: XS; depends on M1)

- **T2.1** `TsldViewControls.tsx:107-121`: each toggle → `CheckboxField density="compact"` inside the
  existing `fieldset`/`legend`. Only delta: 6 → 8 px label gap.
  - Tests: `TsldViewControls.test.tsx` (queries by role/name) green; `TsldPanel.test.tsx` green.
    No e2e drives these boxes — their only production host is the guest view
    (`GuestPlanView.tsx:266`), and `e2e-share` does not touch them; run `e2e-share` anyway as the
    journey that mounts the surface (ADR-0081).
- **T2.2 Docs:** close `docs/TECH_DEBT.md` #72 with the re-verified count (three hand-rolled
  checkboxes, not five; the toolbar ones had already moved, the rest are radios) and the declined
  row-as-hit-target with the spec §3 reasons. Mark the spec `Approved`/built per ADR-0131.
  `docs/COMPONENT_LIBRARY.md` has no checkbox entry (grep: no match), so no edit owed there.
- **Reviews:** component-reviewer (shares the M1 review if shipped in one PR).

## Definition of done

`pnpm prepush` green; the three e2e suites in M1 plus `e2e-share` run locally and green; component +
accessibility reviews clean; changeset added. **Nothing requires the product owner to test, measure
or check anything** — every verification above runs locally or in CI.

## Out of scope (recorded, not filed)

The row-as-hit-target (spec §3); a `RadioField` for `tsld-toolbar-items.tsx:2221`/`:2311`, whose
`TOGGLE_ROW` docblock (`:155-159`) still cites a #138(b) that is no longer a register row; coarse
growth for the default `CheckboxField` (an ADR-0183 question).
