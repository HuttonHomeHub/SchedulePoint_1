// @ts-check
/**
 * Reading the CI workflow's "Build shared packages" steps.
 *
 * Extracted from `check-build-contract.mjs` so the rule can be tested without importing that gate,
 * which runs and calls `process.exit` at import. The gate's behaviour is unchanged: it calls these.
 *
 * **Why this is a module rather than a regex inline in the gate.** The gate used a single
 * non-global `RegExp.exec`, which was correct only while exactly one job built shared packages.
 * `docs/specs/ci-sharding/` M2 split the end-to-end work into `e2e-api` and `e2e-web`, so there are
 * now two — and the blind version was **verified** rather than suspected: with `@repo/layout`
 * deleted from the SECOND step, the gate printed `Build contract OK — 5 shared package(s) built by
 * every consumer`. It named a contract and checked half of it, which is worse than not existing,
 * because a passing gate is quoted.
 */

/**
 * Every `Build shared packages` step's `run:` line, in workflow order.
 *
 * **Global, and that is the whole point.** The non-global form returns the first match and reports
 * nothing about the rest; there is no error, no warning, and no way to tell one step from four.
 */
export function buildStepsIn(ci) {
  return [...ci.matchAll(/- name: Build shared packages\n\s+run: (?<run>.*)\n/gu)].map(
    (m) => m.groups?.run ?? '',
  );
}

/**
 * Which of `required` a single build step fails to build.
 *
 * Sorted, so a caller's findings are stable between runs — an unstable finding order makes two
 * identical failures look like different ones.
 */
export function missingFrom(buildStep, required) {
  return [...required].sort().filter((dep) => !buildStep.includes(`pnpm --filter ${dep} build`));
}
