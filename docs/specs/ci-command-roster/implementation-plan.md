# Implementation Plan: Every command CI runs is one `pnpm prepush` runs, or says why not

- **Feature spec:** [`feature-spec.md`](feature-spec.md)
- **Status:** Approved — by the product owner, 2026-10-22, with all defaults
- **Owner:** repo (builder agent, after approval)

**Size: S.** One milestone, one commit, leaves `main` releasable. Depends on CQ-1 (build at all) and
CQ-2 (the `pnpm build` entry's form). Every step runs in the session container; nothing asks the
owner to test or measure anything.

## Milestone M1 — the converse roster rule (S)

- **T1 — red-first fixtures** in `scripts/check-ci-roster.test.mjs`, through `runGate(root)` like
  every case there (`:10-12`), each naming the mutation that made it red. The `prepush()` fixture
  helper (`:47-48`), which `tree()` uses by default (`:31-34`), gains three `run "lint" pnpm lint`-style
  lines so every existing case keeps a parseable stage set.
  1. **R9:** `quality` with `pnpm check:a` and `pnpm build`, no entry → 1. Red against today's gate
     (it returns 0).
  2. **R9:** the same with `ciOnly.commands["pnpm build"]` given a reason → 0; with `"   "` → 1.
  3. **R9 stage parse:** `pnpm lint` passes with the stage line present and fails when the fixture's
     `prepush.sh` drops it — proves the stages are read, not restated.
  4. **R9 comment:** a command named only in a shell comment inside a `run:` value is not counted.
  5. **R10:** a second job `e2e` with `run: pnpm test:e2e` → 1; listed in `ciOnly.jobs` → 0.
  6. **R11:** an entry for a command no checked job runs → 1; a job entry naming no job → 1.
  7. **R12:** `ciOnly.commands["pnpm lint"]` → 1.
  8. **R13:** a `run: |` block in a checked job → 1; a fixture `prepush.sh` with no stage lines → 1;
     a workflow with no `jobs:` → 1.
  9. **E10:** the existing workspace-call case (`:223-235`) gains a `ciOnly.commands` reason for
     `pnpm --filter @repo/web check:bundle-size`, plus a sibling asserting it is 1 without it.
  10. **Pinned positive** (`:353-356`) stays: the real repository → 0.
- **T2 — verify red** (ADR-0110 D5): run T1 against today's gate (cases 1, 5, 6, 7, 8 fail) and
  against a variant that deletes each new rule in turn; record which case each deletion turned red
  in the commit body. Run case 10 before the JSON edit to see it fail on exactly E6's four commands
  and three jobs.
- **T3 — the rule.** `scripts/check-ci-roster.mjs`: parse jobs and their `run:` lines from the
  already-stripped text (`:140`); parse stages from `prepush.sh` (beside `parseAdvisoryGates`,
  `:193-203`); add R9–R13 after R4a; extend `summary` (`:288-290`) with the command count and
  entries. Docblock: one paragraph citing #299 and this spec, and the "what this does NOT check"
  list (`:39-44`) gains "other workflows".
- **T4 — the JSON.** `scripts/ci-roster.json`: `ciOnly.jobs` (3) and `ciOnly.commands` (4) with full
  reasons per spec §4; extend the `_` comment with one sentence on the new map.
- **T5 — docs.** ADR-0160: a dated amendment paragraph (the reverse assertion is now built, CQ-1);
  CLAUDE.md §16's ADR-0160 line gains its amendment note; the `ci.yml` comment at `:181-192` gains one
  sentence that the gate now checks both directions; `docs/TESTING.md` names the rule where it
  describes `check:ci-roster`; close #299 in `docs/TECH_DEBT.md` in the form `check:debt-status`
  accepts, and note in #300 that its sibling closed.

**Risks.**

- Text parsing misreads a future job (a nested `steps:` under a matrix, a reusable-workflow `uses:`
  job) → R13 refuses on zero commands for a checked job; a reusable job has no `run:` and is refused,
  so it must be listed in `ciOnly.jobs` deliberately.
- The allowlist becomes a dumping ground → R11/R12 keep it honest in both directions, and the JSON's
  own comment already says "not yet" is not a reason (`ci-roster.json:2`).
- Interacts with Spec `gate-failure-output` only by both reading `prepush.sh`; that spec edits
  `run()`'s body, not its call lines, so either can land first.

**Testing requirements.** T1 green, T2 recorded, `pnpm prepush` green (`check:ci-roster` and
`check:doc-register` both exercise it). No `apps/api` change, no Playwright suite: no e2e half.

**Change impact.** No new ADR (spec §4); ADR-0160 amended. No changeset: the root package is private
(`package.json:4`). No new CI step. Review: **devops-reviewer** (CI semantics and the job
exemptions) and **test-engineer** (fixtures and the red verification).
