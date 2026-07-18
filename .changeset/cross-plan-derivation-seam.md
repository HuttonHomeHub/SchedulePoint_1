---
'@repo/api': minor
---

Live cross-plan derivation seam + PARITY gate (inter-project M2, ADR-0045 §2 / ADR-0035 §30.5, F4). At
recalc time the schedule service now derives each activity's effective external early-start /
late-finish bounds from its **live** cross-plan edges' upstream **persisted** computed dates and folds
them into the existing M1 `externalEarlyStart` / `externalLateFinish` inputs — so a downstream plan can
track dates that live in another plan. The **pure CPM engine is untouched** (`compute.ts` / `level.ts` /
`constraints.ts` unchanged): the derivation lives ABOVE the engine as a pure, engine-free helper
(`cross-plan-derivation.ts`).

- **Derivation (`deriveExternalInstants`)** — day-granular, mirroring the engine's forward/backward
  bound shapes: forward (external early start) from each **incoming** edge (FS→predEF+lag, SS→predES+lag,
  FF→predEF+lag−succDur, SF→predES+lag−succDur), composed with the M1 column by **later-of** (§30.1);
  backward (external late finish) from each **outgoing** edge (FS→succLS−lag, SS→succLS−lag+predDur,
  FF→succLF−lag, SF→succLF−lag+predDur), composed by **tighter-of** (§30.2). A never-calculated upstream
  contributes **no** bound and is counted (`crossPlanUpstreamMissingCount`, N32) — never an error.
- **PARITY gate** — the cross-plan loads run **only** when a plan has ≥1 active cross-plan edge
  (`countActiveForPlan`); a plan with none takes the unchanged M1-column path, so the engine input — and
  therefore its output — is **byte-identical**. The whole existing engine + conformance golden suite
  passes unchanged.
- **Observability** — `crossPlanUpstreamMissingCount` is threaded into the recalc structured log
  (absent/`null` on the no-cross-plan path, so existing summaries and goldens do not move).

Inert on existing plans (no cross-plan edge ⇒ no behaviour change); `main` stays releasable.
