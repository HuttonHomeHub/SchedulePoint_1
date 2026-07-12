# Runbook — Enabling on-canvas TSLD editing

> **Status (2026-07-12):** the two **web** flags default **ON** in the shipped
> bundle — on-canvas editing and the pen are live wherever config doesn't opt out.
> The server-side write-gate `PLAN_EDIT_LOCK_ENFORCED` remains **default-off** and is
> the single remaining operator switch. This runbook is the operational procedure
> for that switch (and for opting out). It complements
> [ADR-0028 §9](../adr/0028-plan-edit-lock.md) (the rollout ordering) and
> [ADR-0026](../adr/0026-tsld-canvas-rendering-and-architecture.md) (the canvas).
> Keep it current when the flags or their preconditions change.

## What this enables

Three capabilities. The two **web** flags now default **ON** (all pre-enablement
gates green); the **API enforcement** flag stays default-off as the deliberate
rollout switch:

| Flag                            | Layer                                       | Default | Effect when on                                                                                                                           |
| ------------------------------- | ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PLAN_EDIT_LOCK` (web)     | The edit-lock "pen" front-end               | **on**  | The `EditLockBanner` renders; a Planner takes an exclusive **pen** before editing; status polls + heartbeats run.                        |
| `VITE_TSLD_EDITING` (web)       | On-canvas editing (create/move/link/relane) | **on**  | The TSLD canvas is editable (pointer + keyboard); the pen gates it.                                                                      |
| `PLAN_EDIT_LOCK_ENFORCED` (api) | The `assertHoldsPen` 423 write-gate         | **off** | Structural writes (activities / dependencies / positions / recalculate) from a non-holder are refused **423** `PLAN_EDIT_LOCK_REQUIRED`. |

The **Contributor progress path is never pen-gated** (ADR-0028 Q-C) and stays
available throughout.

## Ordering — enable in this sequence

The order is load-bearing (ADR-0028 §9). Enforcing the API gate before the front
end acquires the pen everywhere would **423 the already-shipped** activities-table,
dependency-editor, and recalculate flows.

1. **Web pen — `VITE_PLAN_EDIT_LOCK` (now default ON).** Users acquire the pen on
   every editing entry point. Harmless while the API still accepts non-holder
   writes (enforcement off), so nothing breaks if a beat is missed. Just ship the
   default; only act here to _opt out_ (`=false`).
2. **API enforcement — set `PLAN_EDIT_LOCK_ENFORCED=true`** once a bundle with the
   pen on is confirmed deployed. Non-holder structural writes now 423; the web
   already routes 423 → read-only + the lost-control banner, so the transition is
   graceful. **This is the one action the flip-to-defaults left for you** — never
   enable it ahead of the web bundle.
3. **On-canvas editing — `VITE_TSLD_EDITING` (now default ON).** The canvas is
   editable; the pen gates it. Ship the default; only act to opt out.

Roll **back** in reverse: `PLAN_EDIT_LOCK_ENFORCED` off → `VITE_TSLD_EDITING=false`
→ `VITE_PLAN_EDIT_LOCK=false`. Each flag is independent and inert when off.

## Pre-enablement checks (before step 3)

- [x] **Flag-on E2E green.** The `test:e2e:edit` Playwright suite
      (`apps/web/playwright.edit.config.ts`) runs the full stack with all three
      flags on and must be green — CI runs it as the "editing flags on" step. It
      covers: the pen gate + single-actor lifecycle (`pen-smoke`) and the keyboard
      edit keymap (`keyboard-edit`).
- [x] **`Alt+←/→` does not navigate history — Chromium.** Automated in
      `keyboard-edit.spec.ts` (the time-nudge keys are `preventDefault`-ed).
- [x] **`Alt+←/→` does not navigate history — Firefox, Safari, Edge (MANUAL).**
      `preventDefault` is the mitigation but browser-chrome accelerators are not
      guaranteed suppressible everywhere. Manually confirmed passing on each
      (2026-07-12); the diagram keeps focus and does not navigate Back/Forward.
      Closes the last pre-enablement gate (TECH_DEBT #25a).
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

- None blocking. The manual cross-browser `Alt+←/→` sweep (TECH_DEBT #25a) — the
  last pre-enablement gate — was confirmed passing on Firefox, Safari, and Edge
  (2026-07-12). The editing flags (`VITE_TSLD_EDITING`, then `PLAN_EDIT_LOCK_ENFORCED`
  per ADR-0028 §9 ordering) can now be enabled in a shared environment.

The single- and multi-actor pen journeys, the keyboard-edit journey, and the
client-side link-legality pre-check all run on the `test:e2e:edit` harness.
