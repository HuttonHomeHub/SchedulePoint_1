# Runbook — Enabling on-canvas TSLD editing

> **Status:** not yet enabled in any shared environment. This runbook is the
> operational procedure to turn the built editing surface on. It complements
> [ADR-0028 §9](../adr/0028-plan-edit-lock.md) (the rollout ordering) and
> [ADR-0026](../adr/0026-tsld-canvas-rendering-and-architecture.md) (the canvas).
> Keep it current when the flags or their preconditions change.

## What this enables

Three capabilities ship **built but flag-gated**, so `main` stays releasable with
no user-visible change until an operator deliberately turns them on:

| Flag                            | Layer                                       | Default | Effect when on                                                                                                                           |
| ------------------------------- | ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PLAN_EDIT_LOCK` (web)     | The edit-lock "pen" front-end               | off     | The `EditLockBanner` renders; a Planner takes an exclusive **pen** before editing; status polls + heartbeats run.                        |
| `PLAN_EDIT_LOCK_ENFORCED` (api) | The `assertHoldsPen` 423 write-gate         | off     | Structural writes (activities / dependencies / positions / recalculate) from a non-holder are refused **423** `PLAN_EDIT_LOCK_REQUIRED`. |
| `VITE_TSLD_EDITING` (web)       | On-canvas editing (create/move/link/relane) | off     | The TSLD canvas becomes editable (pointer + keyboard); the pen gates it.                                                                 |

The **Contributor progress path is never pen-gated** (ADR-0028 Q-C) and stays
available throughout.

## Ordering — enable in this sequence

The order is load-bearing (ADR-0028 §9). Enforcing the API gate before the front
end acquires the pen everywhere would **423 the already-shipped** activities-table,
dependency-editor, and recalculate flows.

1. **Web pen first — set `VITE_PLAN_EDIT_LOCK=true`.** Users now acquire the pen on
   every editing entry point. Harmless while the API still accepts non-holder
   writes (enforcement is still off), so nothing breaks if a beat is missed.
2. **Then API enforcement — set `PLAN_EDIT_LOCK_ENFORCED=true`.** Non-holder
   structural writes now 423; the web already routes 423 → read-only + the
   lost-control banner, so the transition is graceful.
3. **Then on-canvas editing — set `VITE_TSLD_EDITING=true`** once the
   pre-enablement checks below pass. The canvas becomes editable; the pen gates it.

Roll **back** in reverse: `VITE_TSLD_EDITING` off → `PLAN_EDIT_LOCK_ENFORCED` off →
`VITE_PLAN_EDIT_LOCK` off. Each flag is independent and inert when off.

## Pre-enablement checks (before step 3)

- [x] **Flag-on E2E green.** The `test:e2e:edit` Playwright suite
      (`apps/web/playwright.edit.config.ts`) runs the full stack with all three
      flags on and must be green — CI runs it as the "editing flags on" step. It
      covers: the pen gate + single-actor lifecycle (`pen-smoke`) and the keyboard
      edit keymap (`keyboard-edit`).
- [x] **`Alt+←/→` does not navigate history — Chromium.** Automated in
      `keyboard-edit.spec.ts` (the time-nudge keys are `preventDefault`-ed).
- [ ] **`Alt+←/→` does not navigate history — Firefox, Safari, Edge (MANUAL).**
      `preventDefault` is the mitigation but browser-chrome accelerators are not
      guaranteed suppressible everywhere. Manually confirm on each before enabling
      `VITE_TSLD_EDITING` in a shared environment (TECH_DEBT #25a). If a browser
      still navigates, treat it as a blocker for that browser.
- [ ] **Heartbeat holder-profile round-trip removed at scale (advisory).** Done for
      the common beat (TECH_DEBT #26); re-confirm DB load is flat under many
      concurrent editors before broad enablement.

## Verify after enabling

- A Planner sees **Start editing**; taking it reveals the create/edit affordances.
- A second Planner (or the same user in another tab) sees the plan **read-only**
  with the holder named, and can **Request control**; the holder can **Hand over**.
- A non-holder's structural write returns **423** and the UI drops to read-only
  (it does **not** surface a raw error).
- Recalculate is available only to the pen-holder; **progress reporting stays
  available** to Contributors regardless of the pen.

## Known gaps at enablement

- The cross-browser `Alt+←/→` sweep above is manual (TECH_DEBT #25a) — the only
  remaining pre-enablement gate.

The single- and multi-actor pen journeys, the keyboard-edit journey, and the
client-side link-legality pre-check all run on the `test:e2e:edit` harness.
