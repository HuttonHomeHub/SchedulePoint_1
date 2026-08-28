# Implementation Plan — the narrow-shell journey (#172)

Epic: correctness programme Phase 2. One milestone; the journey is the deliverable (ADR-0081 —
the capability already ships, the instrument is what was missing).

## M1 — the suite, the config, the CI step

- **T1 — read before writing.** Read `apps/web/e2e/` helpers (seeding, sign-up), one recent
  suite's config (`e2e-workspace-chrome`) for the config conventions (`webServer`, flag pins,
  reporter), and the shell components the assertions will name (`app-header.tsx`, the Sheet,
  `hostsDock`). List every flag the base config pins and decide each pin deliberately for this
  config (the ADR-0084 batch-1 lesson: a config can BE a flag harness).
- **T2 — the config.** `apps/web/playwright.narrow-shell.config.ts`, viewport 390 × 844,
  fine pointer (recorded in the docblock, with #133 named as the coarse owner), plus
  `test:e2e:narrow-shell` in `apps/web/package.json`.
- **T3 — the spec.** `apps/web/e2e-narrow-shell/narrow-shell.spec.ts`: FR-1 sheet navigation,
  FR-2 header reachability (`elementFromPoint`), FR-3 breakpoint crossing both directions,
  FR-4 below-`md` facts/Recalculate reachability, FR-5 scoped axe scan. Expect first runs to
  FIND defects; triage each as product fix vs test fix honestly, fixes red-first.
- **T4 — wiring.** CI step beside the other flag-on suites in the workflow;
  `scripts/e2e-local.sh` picks the script up (verify its derived list sees it — the ADR-0112
  lesson: the sweep list must be derived, and was once wrong in both directions).
- **T5 — docs.** `docs/TESTING.md` suite table; `docs/TECH_DEBT.md` #172 closed with what the
  first run found; CLAUDE.md counts re-derived (`pnpm check:counts` — the suite count moves
  40 → 41).

Definition of done: suite green locally via `scripts/e2e-local.sh web:narrow-shell`, CI step
green, any product defects it finds fixed red-first or filed with evidence.
