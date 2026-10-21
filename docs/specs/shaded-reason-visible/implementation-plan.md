# Implementation Plan: A shaded control's reason is visible to every input

- **Status:** Approved — by the product owner, 2026-10-21, with all defaults
- **Spec:** [`feature-spec.md`](feature-spec.md) · **Tracking:** `docs/TECH_DEBT.md` #116 item 3
- **Date:** 2026-10-21 · **Size:** S–M overall (M0 S, M1 S, M2 M) · **Flag:** none (ADR-0088 D1)
- **Changeset:** `@repo/web` **minor** — user-visible behaviour on every shaded menu item and labelled
  toolbar control, and a new `useTooltip` purpose value (a component public contract).

Each milestone is one PR that leaves `main` releasable. No schema, no API, no `apps/api` change, so
`scripts/e2e-local.sh api` is not owed; the web suites listed per milestone are.

## Epic: Shaded reasons, visible

### M0 — ADR-0204 and the rule in the docs (S)

- **T0.1 Write ADR-0204** from spec §4's outline; add its one-line §16 entry to `CLAUDE.md`; set
  ADR-0082's header to "amended by ADR-0204". Steps: draft → `pnpm check:adr-coverage`.
- **T0.2 Docs:** `UX_STANDARDS.md` "Row / node actions" (`:204-214`) and Interaction standards
  (`:110-115`); `COMPONENT_LIBRARY.md` `title` discriminator (`:865-872`).
- **Dependencies:** approval (CQ-1, CQ-2). **Risk:** low. **Tests:** `pnpm prepush` (doc gates).
- May land with M1 rather than alone; it must not land after it.

### M1 — Menu and Combobox print the reason inline (S)

**Feature: `MenuItem` reason inside the item**

- **T1.1 Prove the description survives first** (red/green, before moving markup):
  1. In `menu.test.tsx`, add: shaded item with reason → `toHaveAccessibleName('Edit')` exactly and
     `toHaveAccessibleDescription(reason)` **with the reason node inside the item, `aria-hidden`**.
  2. If jsdom's accname disagrees with accname 1.2 §2A, stop and take the Chromium answer from the
     M1 journey step instead; record which tier proves it.
- **T1.2 Implement** in `menu.tsx:440-527`: item becomes a two-line column (label row unchanged; reason
  line `text-muted-foreground text-xs`, `aria-hidden`, same `id`); delete the reason sibling span;
  leave the `srDescription` sibling alone; panel gets `max-w-72` (`menu.tsx:286`). Update the
  `MenuItem` docblock (`:355-370`) — it currently argues for the sibling.
- **T1.3 Unit tests:** visible text present iff `disabled && disabledReason`; live item has no
  `aria-describedby`; name unchanged with `busy`, `selected`, `checked`; `srDescription` order still
  reason-first (`:445-448`); roving focus still stops on the shaded item.

**Feature: `ComboboxOption` parity (dark)**

- **T1.4** Same treatment at `combobox.tsx:495`; name stays `label` + `badge`; refused-Enter
  announcement unchanged. Unit tests only — no caller (ADR-0082 Amendment), so the journey is owed by
  the first caller (ADR-0081 §1); say so in the PR.

**Journey (ADR-0081 — the capability's gate)**

- **T1.5** Extend `e2e-edit/pen-handoff.spec.ts:145-172`: assert the reason text is **visible inside**
  the shaded `Edit` menuitem, and that the name is still exactly `Edit`. Fix `:167`, which reads
  `allTextContents()` and will now include the reason — derive the index from accessible names instead.
  Verify red against the pre-M1 build (the visible assertion must fail).
- **e2e to run:** `web:edit`, `web:wbs` (`wbs.spec.ts:251-268`, shaded Dissolve), `web:gantt-editing`
  (`view-state.spec.ts:200`, Gantt row menu), and base `web` (`e2e/activities.spec.ts`, row menu).
- **Reviewers before ship:** accessibility-reviewer (ADR-0111 — `Menu`'s focus contract is not changed,
  but its items' content model is; contrast of muted `text-xs` on popover), component-reviewer, ux-reviewer.
- **Risks:** (a) jsdom accname gap — T1.1 catches it first. (b) Visual repetition when several items
  share a reason (CQ-1). (c) A page-wide `getByText(reason)` in a journey goes ambiguous while a menu
  is open — the listed suites cover every current menu with a shaded item.

### M2 — Labelled toolbar controls show the reason by tooltip (M)

**Feature: `useTooltip` gains `'reason-echo'` and press-to-reveal**

- **T2.1** `tooltip.tsx`: add `purpose: 'reason-echo'` (`aria-hidden` panel, no describedby — same
  wiring as `'name-echo'`, `:437-439`, `:428`); add option `revealOnPress` — a click on the trigger
  opens the tip (all pointer types) instead of being ignored. Unit tests: no `aria-describedby` added;
  focus opens immediately; a press opens and the long-press path is unchanged; Escape still
  `preventDefault`-only; one-open token respected.
- **T2.2** Confirm S7's AT channel (`selection-actions.tsx:306`, what `api.itemProps` carries) before
  touching it; if it has no linked reason, add the sr-only span in the same pattern.

**Feature: wire S3–S7**

- **T2.3** `ToolbarButton` (labelled branch, `:143-149`, `:164-170`, `:199`): shaded + reason ⇒ tip
  `'reason-echo'` with the reason alone, `revealOnPress`; drop the native `title` in that branch only
  (the live `description` clause keeps `title`, per `COMPONENT_LIBRARY.md:871`).
- **T2.4** Same for `ToolbarPopover` (`:211-217`), `ToolbarSplitButton` (`:194`, `:258`),
  `plan-facts.tsx:348-350` Recalculate, `selection-actions.tsx:306` Isolate.
- **T2.5 Unit tests** per primitive: no `title` when shaded; tip text equals the reason; accessible
  name and description strings character-identical to today (the existing suites are the oracle).

**Journey**

- **T2.6** Add one step to `e2e-workspace-chrome/placement-overlays.spec.ts` near `:403` (a labelled
  shaded command, "Start editing to apply levelled dates"): focus it → `[data-tooltip]` visible with
  the reason; press it → nothing applied, tip visible. Verify red first.
- **e2e to run:** `web:workspace-chrome`, `web:toolbar`, `web:workspace-fit` (`promotion.spec.ts:878`),
  `web:minimap`, `web:copy-paste` (shaded `Duplicate`, `copy-paste.spec.ts:255-265`), `web:health-check`,
  `web:interchange`, `web:authoring-flow`, `web:resource-view`, `web:edit` (`pen-handoff.spec.ts:176-187`
  already had one `getByText` ambiguity from a reason; a tip opened by focus could reintroduce it).
- **Reviewers before ship:** accessibility-reviewer **and** component-reviewer (ADR-0111: five
  primitives change what focus and a press do), ux-reviewer, performance-reviewer (tooltip per
  shaded control on the deck — the hook is already mounted for tipped controls; confirm no new cost).
- **Risks:** (a) Arrowing the deck pops a tip on every shaded stop — the same behaviour icon-only
  controls already have (ADR-0117); accepted. (b) A tip opened by a mouse press must not land on the
  trigger (`tooltip.tsx:128-145` already places it off the trigger). (c) Changing the shaded `title`
  could break a journey that hovered for it — the suites above are the check.

### Close-out

- Mark `docs/TECH_DEBT.md` #116 **closed** (item 3 was its last open item, `:2396-2403`); file the
  Gantt read-only cell (`GanttCell.tsx:211-214`) as a new row if the owner wants it tracked.
- Changeset (`@repo/web`, minor) in M1; M2 adds its own line. `pnpm prepush` before each push.
- Nothing in this plan asks the owner to test, measure or check anything on a host or device.
