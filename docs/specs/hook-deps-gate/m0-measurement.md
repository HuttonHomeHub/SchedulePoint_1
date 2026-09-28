# M0 measurement: `docs/TECH_DEBT.md` #353

The feature spec was written without a shell (its own preamble says so). This is M0's replacement
of every reasoned claim with a run — and the two places where running something changed the plan.

## M0-T0: dependency claims registered

Four decision-bearing citations into `eslint-plugin-react-hooks@7.1.1` and
`@tanstack/react-query@5.103.2` / `@tanstack/query-core@5.103.2` are registered in
`scripts/dependency-claims.json` (`verifiedAgainst` + `resolveVia` for both packages, plus the four
`claims` entries). Each anchor was re-read at the installed version rather than copied from the
spec:

- `eslint-plugin-react-hooks.development.js:55415-55418` — `basicRuleConfigs`, confirming
  `'react-hooks/exhaustive-deps': 'warn'` (E1). Matches the spec's citation exactly.
- `eslint-plugin-react-hooks.development.js:50685-50688` — `DEFAULT_ESLINT_SUPPRESSIONS` (E14).
  Matches.
- `useBaseQuery.js:46` — `@tanstack/react-query`'s `trackResult` call (E13). Matches.
- `queryObserver.js:163-164` — `@tanstack/query-core`'s `trackResult`, `return new Proxy(result, {`
  at line 164 (line 163 is the method signature the range also covers). Matches.

`pnpm check:claims` passes (`Dependency claims OK (118 claims against …)`). One anchor
(`DEFAULT_ESLINT_SUPPRESSIONS`'s line range) was deliberately corrupted and reverted to confirm the
gate goes red on a wrong anchor — it did (`the anchor is no longer at …`).

Three of the four claims print as `note: … is registered but no longer cited anywhere` — this is
**not a failure** (E19: `check:claims` reports a dead registration and exits 0). It means the
completeness scanner's two citation patterns (`file.ext:123` / `` `file.ext`, lines **123** ``)
did not find a matching inline citation in this file's own prose for those three, because the
prose above states the fact without a line number sitting next to the filename in either accepted
shape. `useBaseQuery.js:46` does not print the note, because `use-tsld-toolbar-context.print.test.tsx`
already cites it inline twice (see M0-T4).

## M0-T1: the lint inventory

Nine workspaces have a `lint` script (matches E2/E3 exactly): `apps/api`, `apps/seed-cli`,
`apps/web`, `packages/engine-conformance`, `packages/interchange`, `packages/layout`,
`packages/seed`, `packages/seed-http`, `packages/types`. `packages/config` has none (it is the
ESLint config package itself).

Run with every `.eslintcache` deleted first (`pnpm --filter <ws> exec eslint . --format json`, not
through `turbo run lint`, which stops at the first failing workspace):

| Workspace                     | Errors | Warnings | Breakdown                                                                   |
| ----------------------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `apps/web`                    | 0      | **10**   | 3 `exhaustive-deps` (sites 1/2/3), 2 `incompatible-library`, 5 `no-console` |
| `apps/api`                    | 0      | **1**    | 1 `no-console` (`m0-engine-input.e2e-spec.ts:76`)                           |
| `apps/seed-cli`               | 0      | 0        |                                                                             |
| `packages/engine-conformance` | 0      | 0        |                                                                             |
| `packages/interchange`        | 0      | 0        |                                                                             |
| `packages/layout`             | 0      | 0        |                                                                             |
| `packages/seed`               | 0      | 0        |                                                                             |
| `packages/seed-http`          | 0      | 0        |                                                                             |
| `packages/types`              | 0      | 0        |                                                                             |

**This matches E5–E7 exactly** — the spec's cache-derived count (E6: "10 warnings across 8 files, 0
errors") and E7 ("apps/api has one warning and every other package has none") are both confirmed
by a cold run. No unexpected sites; the ≤10-unexpected-warnings stop condition does not fire.

No unused-eslint-disable-directive warnings exist anywhere in the tree at M0 (subject to E16).

**Re-run after M1's fixes (this document, taken after every M1 commit): all nine workspaces report
zero warnings and zero errors**, with `.eslintcache` cleared first each time.

## M0-T2: two rule-behaviour experiments

**(a) Site 1 (E8).** A scratch probe (`apps/web/src/__scratch_rule_probe.tsx`, deleted after the
run) with two hooks:

```tsx
function useProbeA(model) {
  const planId = model.planId; // property READ, listed
  return useMemo(() => `${planId}`, [planId]);
}
function useProbeB(model) {
  return useMemo(() => model.scheduleRefusal('recalculate'), [model.scheduleRefusal]); // method CALL
}
```

`useProbeA` lints clean. `useProbeB` reports `React Hook useMemo has a missing dependency: 'model'`
— even though `model.scheduleRefusal` is already listed. **Confirms E8 exactly**: the rule accepts
a plain property read with no further ask, and asks for the whole object only when a method is
**called** on it.

**(b) E20.** The same probe confirms `useProbeA`'s shape (`model.planId` read and listed) produces
no warning, refuting the comment at `plan-workspace-toolbar.tsx`'s `migrationPlanId` site, which
claimed the rule "cannot see through a member expression" — it can, for a read; it cannot for a
call, which is the real reason site 1 needed the extraction. Both comments are corrected in the
site-1 commit.

## M0-T3: compiler suppression scope

A scratch probe (`apps/web/src/__scratch_m0t3.tsx`, deleted after the run) with three hooks: (A) a
`react-hooks/refs` violation and an `eslint-disable-next-line react-hooks/exhaustive-deps`
suppression in the **same** function; (B) the suppression in a **separate** module-private hook in
the same file, with the ref violation in the caller; (C) the React-documented "store information
from previous renders" `useState` form, with no suppression at all.

**Result: `react-hooks/refs` fired in BOTH Case A and Case B** — i.e. the exhaustive-deps
suppression did not observably disable the ref-analysis diagnostic even in the **same function** as
the suppressed hook, let alone leak wider. Case C produced zero diagnostics.

This is narrower than the spec's E14/D1a framing, which treated "suppresses within the enclosing
function" as the expected default and "leaks to the whole file" as the named risk. What was
measured is a third outcome: under this repository's exact `eslint-plugin-react-hooks@7.1.1`
config, a `react-hooks/exhaustive-deps` suppression does not observably disable `react-hooks/refs`
reporting **anywhere** that was tested. `DEFAULT_ESLINT_SUPPRESSIONS`'s existence (E14, confirmed
at M0-T0) is real, but whatever it protects was not reproduced by this probe.

Per the plan's own fallback rule ("If it is not [scoped to the enclosing function], M1-T2 falls
back to the … `useState` form … provided M0-T3 shows no compiler rule fires on it"): the scoping
premise does not hold (Case A itself fails to demonstrate same-function scoping), and Case C is
confirmed clean. **M1-T2 uses the `useState` fallback form for `useKeyedIdentity`, needing no
suppression of any kind** — which sidesteps the E14 question entirely for that site rather than
resolving it.

## M0-T4: toolbar context identity (E13)

**First finding: the case as first written was not isolating what it claimed to.** A unit case
rendering `useTsldToolbarContext` with a **real** `useQuery` result (seeded `QueryClient`,
`usePlanDependencies`) and re-rendering with nothing changed initially **failed** — confirming E13
directly (identity churns every render because `trackResult` hands back a new Proxy regardless of
whether `.data` changed, and `exportMatch`'s dependency list read the raw wrapper).

But two **other** sources of churn were present in the same harness and would have kept the case
red even after fixing `exportMatch` alone:

1. `useTsldToolbarContext`'s four optional parameters (`toggleFloatPaths`, `toggleHealthCheck`,
   `toggleRevisionCompare`, `setPlanView`) default to `() => {}` — a fresh function literal on
   every render the prop is omitted from. The case did not pass them.
2. `use-tsld-toolbar-context.print.test.tsx`'s own `vi.mock('@/features/schedule/api/use-schedule')`
   returned `{ isPending: false, run: vi.fn() }` as a fresh object literal on every call — `recalc`
   is one of the outer memo's listed dependencies.

Both are unconditional churn sources, present whether or not E13 exists, and were caught by
instrumenting the memo's actual dependency-array diff between renders (a temporary probe wrapping
the deps array and comparing each slot's identity against the previous render's). Fixed in the test
harness (stable `vi.fn()`s passed explicitly for the four callbacks; the `useRecalculateCommand`
mock hoisted to return one shared object) — not in the product, since both are pre-existing,
independent of this row, and out of scope per the spec's own M0-T4 risk callout ("any other unstable
member is recorded in a register row, not fixed here"). Filed as `docs/TECH_DEBT.md` row material
below.

With those two neutralised, the case **fails on E13 alone**, confirming it cleanly. **After the
M1-T2 fix (site 2 is unrelated to this call site, but `exportMatch`'s own fix at site 3 is what this
case exercises), the case passes.**

## The E12 masking: site 3's defect is real by the rule and currently unobservable in practice

Constructing R8 (the print-test regression case for site 3) surfaced something the spec did not
anticipate. `useDiagramImage`'s returned `buildDiagramImage` callback is a `useCallback` whose
dependency array **correctly** includes the same stabilised `dependencies` local the outer context
memo omitted (`use-diagram-image.ts`'s own array, confirmed by reading it). `buildDiagramImage` is
**also** one of the outer memo's own listed dependencies, and `useDiagramImage` is called
**unconditionally** — regardless of `planView`.

Consequence: any change to `model.dependencies?.data` changes `buildDiagramImage`'s identity
(correctly), which forces the outer memo — and the `printDiagram` closure inside it — to rebuild on
that same render, **whether or not `dependencies` is itself listed**. A naive reproduction (mutate
`model.dependencies.data` in place, re-render, call `printDiagram`) therefore **passes on the
pre-fix code**, because the memo rebuilds anyway via the `buildDiagramImage` path and the fresh
`printDiagram` closure picks up the current `dependencies` regardless.

This was confirmed empirically: `useDiagramImage` was stubbed to a stable `vi.fn(() => null)` via
`vi.spyOn` for the R8 case specifically (safe, because the Gantt branch never calls
`buildDiagramImage`), and only with that stub in place does the case go red on pre-fix code and
green after the fix. Without the stub, both pre- and post-fix code pass identically.

**What this means for the spec's E12 claim:** the missing dependency is real (the lint rule
correctly names it, independent of any other code's behaviour) and the fix is still necessary and
correct (it satisfies the armed rule and removes a fragility), but **the practical staleness E12
describes is not currently reachable through the reproduction the spec sketches**, because
`buildDiagramImage`'s own correct wiring to the same value happens to mask it on every render where
`model.dependencies?.data` changes. If `useDiagramImage`'s implementation is ever refactored to stop
depending on `dependencies` (or made conditional on `planView !== 'gantt'`), the staleness would
become directly observable with no lint warning protecting it at that point — which is exactly why
the fix (listing `dependencies` explicitly) is correct regardless of whether today's masking holds.

This correction is recorded rather than left implicit, per the "verify the claim" rule this
repository's own register enforces on itself.

## M0-T5: the pass-with-findings survey

E19's case (`check:claims` prints a `note:` line for a dead registration and exits 0) is confirmed
directly at M0-T0 above. A light survey of the other `check:*.mjs` scripts for a `console.warn`/
`console.log` reachable from a passing branch (i.e. not gated by a nonzero exit) found the same
`console.warn('note: …')` shape used nowhere else in the small sample read
(`check-advisory-agreement.mjs`, `check-build-contract.mjs`, `check-counts.mjs`,
`check-doc-links.mjs`, `check-flags.mjs`, `check-playbook.mjs`) — each of those either fails loudly
on a finding or prints only on success with no finding-shaped content. This is not an exhaustive
audit of every `check:*` script in the tree; E19's `check:claims` case remains the one confirmed
instance, per the spec's own framing ("E19 shows the rule is already broken outside lint … Changing
a different gate is outside this approved scope under ADR-0105, so it is filed as a register row").

## Corrections to the spec's own claims (ADR-0076 Class 3, applied to this spec itself)

1. **E14's scope claim is narrower than what M0-T3 measured.** See M0-T3 above — the spec expected
   either "scoped to the enclosing function" or "leaks to the whole file"; what was found is
   "did not observably fire in either tested placement." Recorded rather than smoothed into either
   of the spec's two anticipated outcomes.
2. **E12's "real staleness defect" needs the masking caveat above.** The fix is unchanged; the
   claim about when a reader would see it in practice is narrower than stated.
3. Two of the four M0-T0 registered claims are individually uncited by this file's own prose (no
   inline `file:line` form appears next to the filename) — not a failure of the gate, but recorded
   here so the three `note:` lines `check:claims` prints are traced to their cause rather than
   left as an unexplained oddity in a future `pnpm check:claims` run.

## Deferred rather than fixed here (ADR-0105; new register-row material)

- The two M0-T4 test-harness confounds (`use-tsld-toolbar-context.print.test.tsx`'s
  `useTsldToolbarContext` default no-op parameters recreating a fresh `() => {}` per render when
  omitted; the file's `useRecalculateCommand` mock recreating a fresh object per call) were fixed
  **in the test file only**, since both are pre-existing test-harness properties unrelated to
  #353's three named sites, and fixing them in the test double is what makes the identity cases
  (R8, M0-T4) mean what they claim to mean. No product code changed for either.
- The `buildDiagramImage`-masks-`dependencies` finding above is recorded as a property of the
  current wiring, not filed as a defect: nothing is wrong today, and the fix already removes the
  fragility. Worth a register row noting the coupling exists, so a future refactor of
  `useDiagramImage` does not silently reintroduce the staleness E12 describes with no test catching
  it (the R8 case, once written with the `useDiagramImage` stub, DOES catch it going forward).
