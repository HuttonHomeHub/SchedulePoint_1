# ADR-0164: A lint warning is a failure, and a gate has no pass-with-findings outcome

- **Status:** Accepted
- **Date:** 2026-09-28
- **Supersedes:** nothing
- **Amends:** ADR-0120 (its 0/2/other exit convention — a lint warning is now the same obligation
  class as a lint error) and ADR-0124 (`check:advisory-agreement`'s "advisory is a declaration, not
  a number any tool can reach" rule, restated below for lint specifically)
- **Spec:** [`docs/specs/hook-deps-gate/`](../specs/hook-deps-gate/)

## Context

`docs/TECH_DEBT.md` #353 made two claims. The narrow one: `react-hooks/exhaustive-deps` ran at
`warn` (`eslint-plugin-react-hooks@7.1.1`'s recommended preset), no workspace `lint` script passed
`--max-warnings=0`, and `pnpm lint` exits 0 on any number of warnings — so the rule named four real
staleness defects on the day each one shipped (a listbox announcement, an exported title, the
selection bar, and a fourth found while filing this row — the printed Gantt's Predecessors column,
below), and nothing stopped any of them landing. The wide one: `scripts/prepush.sh` has no way to
show a gate that passed **with findings**, so a warning anywhere is invisible by construction, not
only for this one rule.

The spec that answers this row (`docs/specs/hook-deps-gate/feature-spec.md`) was written without a
shell — every claim in it was reasoning from source, corroborated only by a stale `.eslintcache` of
unknown age. M0 replaced every one of those claims with a run. The inventory it found matches the
spec's reasoned count exactly (10 warnings in `apps/web` — 3 `exhaustive-deps`, 2
`incompatible-library`, 5 `no-console`; 1 `no-console` in `apps/api`; zero elsewhere), which is
itself worth recording: the spec's untested reasoning happened to be right, and M0 is the reason
anyone can say so rather than assume it.

Two of M0's own findings narrowed the spec's claims rather than confirming them, and both are
recorded rather than smoothed into the spec's original framing (ADR-0076 Class 3, applied to this
spec by its own M0):

- **E14's compiler-suppression-scope claim was narrower than measured.** The spec expected an
  `exhaustive-deps` suppression to disable the React Compiler's ref/set-state analysis either "for
  the enclosing function" or "for the whole file". A scratch probe found a third outcome: under this
  repository's exact plugin version and config, the suppression did not observably disable
  `react-hooks/refs` reporting in **either** tested placement. `DEFAULT_ESLINT_SUPPRESSIONS` is real
  (confirmed by reading the plugin source and registered in `scripts/dependency-claims.json`); what
  it protects against was not reproduced. Site 2's fix (a module-private `useKeyedIdentity`) was
  built with the React-documented no-suppression `useState` form regardless, sidestepping the
  question rather than resolving it — the fallback the spec's own plan named for exactly this case.
- **E12's "real staleness defect" needed a masking caveat.** Site 3's missing `dependencies`
  dependency is a genuine finding by the rule — but `useDiagramImage`'s own, correctly-written
  `buildDiagramImage` callback happens to depend on the same value and is called unconditionally, so
  today's wiring rebuilds the outer memo anyway on every render that would have exposed the bug. The
  fix (list `dependencies` explicitly) is unchanged and still correct; the practical staleness is not
  currently observable through the reproduction the spec sketches, and would become observable the
  day `useDiagramImage` is refactored to stop reading that value — which is exactly why fixing it now
  rather than leaving it to that day matters.

## Decision

**D1 — `--max-warnings=0` in every one of the nine workspace `lint` scripts** (`apps/api`,
`apps/seed-cli`, `apps/web`, `packages/engine-conformance`, `packages/interchange`,
`packages/layout`, `packages/seed`, `packages/seed-http`, `packages/types`; `packages/config` has no
`lint` script of its own — it is the lint config). Warning severity stops meaning "allowed to pass".
The flag lives in the **workspace** script, not the root `turbo run lint` call, so
`pnpm --filter <ws> lint`, an editor, and CI give the same verdict (ADR-0160's "same command"
principle, applied here).

**D2 — `react-hooks/exhaustive-deps` is `error` in the React preset**
(`packages/config/eslint/react.js`, after the recommended spread). The recommended preset ships it
`warn`; D1 alone would already fail a workspace carrying one, but D2 makes the rule's own severity
honest independent of the flag, and means an editor shows it red rather than amber.

**D3 — Every `react-hooks/*` suppression in `apps/web` carries a written reason on its directive,
enforced by a test** (`apps/web/src/lint-policy.structural.test.ts`). D2 raises the temptation the
row itself named: "a suppression written to get a red gate green is worse than the warning" (#353,
quoting #85). This records what a suppression costs and asks the reason to justify it explicitly —
an `exhaustive-deps` suppression also disables `DEFAULT_ESLINT_SUPPRESSIONS`'s compiler-derived
diagnostics for whatever it sits inside (`react-hooks/refs`, `react-hooks/set-state-*`), which is
real regardless of what M0's narrower measurement (Context, above) could reproduce. The estate's
fifteen pre-existing reasonless directives were given reasons (#353 → #85's own instruction, "justify
it in writing at the call site"); the structural test now makes that permanent rather than a
one-time cleanup.

**D4 — `incompatible-library` stays `warn`.** With `--max-warnings=0` a warning already blocks, so
the severity only decides how an editor displays it. Its two call sites (`GanttPanel.tsx`,
`HierarchyTree.tsx` — both `useVirtualizer`) are suppressed with the consequence stated on the
directive: the compiler's analysis skips the component holding the suppression, so `refs` and
`set-state-*` do not run there either — a cost already being paid for a reason unrelated to this row
(the library is genuinely incompatible today), and one E16's unused-directive report will surface the
day that stops being true.

**D5 — A gate's finding either blocks or is declared advisory. There is no third state.** This is
the row's wide claim, and it generalises past lint: `exit 1` is for an obligation whose remedy is an
edit to the file that failed; `exit 2`, and only for a gate named in `prepush.sh`'s `ADVISORY_GATES`,
is for one whose remedy is somebody's judgement (ADR-0120's discriminator). A lint warning is fixed
by an edit — a dependency, a directive, a reason — so it belongs on the blocking side, and D1 puts it
there. A proposed fourth state ("ok, with findings", printed but non-blocking) was rejected: it is
the pattern that already failed once (`docs/TECH_DEBT.md` #220, an advisory `WARN` nobody acted on,
recorded in `prepush.sh`'s own header as the honest weakness of the advisory state), it would cover
`prepush.sh` only while CI's plain `pnpm lint` stayed green regardless, and building it would tie a
gate to a formatter's summary-line wording. `check:claims`' `note: … registered but no longer cited`
line (E19) is the confirmed instance of the same defect outside lint — a passing gate printing a
finding nobody sees under `prepush.sh`'s `run()`, which sends a passing gate's output to a log. It is
**not** fixed here: changing a different gate's exit behaviour is a shared-gate change and an
ADR-0105 trigger of its own, so it is filed as a register row rather than folded into this scope.

## Alternatives considered

- **Arm `exhaustive-deps: error` with no `--max-warnings=0`.** Leaves `no-console`,
  `incompatible-library`, and any future warn-severity rule a plugin bump adds in the same silent
  state the row describes.
- **`--max-warnings=0` on the root `turbo run lint` only.** `pnpm --filter <ws> lint` and an editor
  would disagree with CI about what passes.
- **A fourth prepush state that prints warnings without blocking.** See D5 — already tried once, as
  `#220`, and it did not work.
- **`incompatible-library: off`.** A new incompatible call site would then pass silently, which is
  worse than the two known, already-suppressed sites this decision accepts.

## Consequences

- **A plugin bump that adds a new `warn`-severity rule fails `pnpm lint`.** That is intended: under
  `--max-warnings=0` the bump PR is exactly when someone should read the new rule, the same stance
  `check:claims` already takes on a dependency bump that moves a cited line.
- **Editors show `react-hooks/exhaustive-deps` in red, not amber.** Intended.
- **One full re-lint on the severity change's first run**, because ESLint's content-keyed cache
  invalidates every entry when a rule's severity changes (confirmed at M2-T1: a cold `pnpm lint`
  with `.eslintcache` cleared took 2m52s with 0 problems, immediately after the tree was cleaned to
  zero warnings in M1).
- **`lint-policy.structural.test.ts` is the one place D1 and D3 are checked against the real,
  resolved config rather than against the source text of `react.js`** — a later config layer (a
  `files` glob, an override, a future preset bump) that quietly restored `warn` would be invisible to
  a text scan of the preset file and is not invisible to this test.
- **The general "no pass-with-findings state" rule is recorded, not built, outside lint** — `#353`'s
  wide claim is answered for lint by D1/D5; `check:claims`' `note:` line (E19) is filed in
  `docs/TECH_DEBT.md` as the confirmed instance elsewhere, per D5's own reasoning about why that is
  a separate, ADR-0105-gated change.
- **The CPM engine is not imported and no migration runs.** `apps/web/src/lint-policy.structural.test.ts`,
  `packages/config/eslint/react.js`, nine `package.json` `lint` scripts, and the sites named in the
  spec's D1 table are the entire diff.

## References

- `docs/specs/hook-deps-gate/feature-spec.md`, `implementation-plan.md`, `m0-measurement.md`,
  `red-run.md`
- `docs/TECH_DEBT.md` #353 (closed, moved to the Closed-numbers ledger by this same change)
- ADR-0058 (a gate that fails on day one gets deleted rather than fixed — why the estate was cleaned
  to zero before arming), ADR-0076 (Class 3, applied to this spec's own M0), ADR-0105 (a shared-gate
  change is a spec trigger — why D5's wide claim is filed rather than built here), ADR-0110 D5
  (verify a gate against the defect it names — `red-run.md`), ADR-0120 (the exit convention this
  amends), ADR-0124 (the advisory-is-a-declaration rule this restates for lint), ADR-0133 D6 (the
  identity property site 2's fix must not regress)
