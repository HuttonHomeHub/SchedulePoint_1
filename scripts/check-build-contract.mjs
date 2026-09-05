#!/usr/bin/env node
/**
 * The ADR-0019 build contract, as a computed gate.
 *
 * A shared workspace package ships COMPILED output, so every app that imports one at runtime has
 * to build it before building itself. That obligation lives in three hand-maintained places — the
 * app's Dockerfile `deps` stage (which COPYs the package manifest so pnpm can resolve the
 * workspace link), the same Dockerfile's `build` stage, and the CI e2e job's "Build shared
 * packages" step, which runs those commands directly rather than through Turbo.
 *
 * Adding a package and forgetting one of them is invisible locally: a developer's checkout already
 * has a `dist/` from an earlier build, so everything resolves. CI starts clean and fails inside
 * `nest build` or a Playwright web server — several minutes in, with an error naming a module that
 * exists. That is exactly how `@repo/layout` (ADR-0069) shipped a red pipeline.
 *
 * The rule: every `@repo/*` in an app's **`dependencies`** must be COPYd and built in that app's
 * Dockerfile, and built in the CI step. `devDependencies` are deliberately out of scope — most are
 * config presets or test fixtures that are never imported by `src`; where one IS needed for the
 * build (`@repo/seed`, whose bench script is inside the web tsconfig) an extra build is harmless
 * and this gate stays quiet about it. Over-building is a cost; under-building is a broken image.
 *
 * **The obligation is TRANSITIVE, and this gate did not always say so.** The paragraph above used
 * to end at "stays quiet about it", which was sound while `@repo/seed` had no `@repo/*`
 * `dependencies` of its own. When it gained one (`@repo/engine-conformance`), the web image stopped
 * building — and neither this gate nor `pnpm prepush` could see it, because the gate never looked
 * past the first level and every local checkout already had the missing `dist/`. A deferral whose
 * premise has lapsed reads exactly like one whose premise still holds.
 *
 * So the required set is now a CLOSURE over two seeds: an app's runtime `dependencies`, and any
 * `@repo/*` the Dockerfile already chooses to build. Building a package obliges you to its whole
 * `dependencies` closure — the moment it is in the chain, its imports are too — and COPY and build
 * take the SAME set, because a package whose manifest is absent from the deps stage is never
 * installed, so its own build fails on missing types several layers from the cause.
 *
 * **`pnpm --filter '<app>...' list --depth -1` is NOT the oracle here, and it is worth saying so,
 * because it looks like one.** That command reports every workspace package pnpm resolves through
 * the filter, dev edges included: for `@repo/api...` it names seven, while `apps/api/Dockerfile`
 * COPYs four and builds correctly. pnpm tolerates an absent workspace manifest — it simply does not
 * link that package — so the manifests an image needs are not the ones pnpm *could* link, but the
 * ones that image actually **compiles**. The API image is the control that settles it, and checking
 * it is what stopped this gate being rewritten around the wider, wrong rule.
 */
import { readFileSync } from 'node:fs';

/** Apps whose Dockerfile carries a build contract, and the file that carries it. */
const APPS = [
  { name: '@repo/api', pkg: 'apps/api/package.json', dockerfile: 'apps/api/Dockerfile' },
  { name: '@repo/web', pkg: 'apps/web/package.json', dockerfile: 'apps/web/Dockerfile' },
];

const CI_WORKFLOW = '.github/workflows/ci.yml';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The `@repo/*` packages an app pulls in at runtime — the ones its compiled output will import. */
function runtimeWorkspaceDeps(pkgPath) {
  const manifest = JSON.parse(read(pkgPath));
  return Object.keys(manifest.dependencies ?? {})
    .filter((name) => name.startsWith('@repo/'))
    .sort();
}

/** A package's own runtime `@repo/*` dependencies — the next level of the closure. */
function workspaceDepsOf(name) {
  return runtimeWorkspaceDeps(`${name.replace('@repo/', 'packages/')}/package.json`);
}

/**
 * The `@repo/*` a Dockerfile has already CHOSEN to build. These seed the closure alongside the
 * app's runtime dependencies: a package in the chain is a declared intent to compile it, and
 * compiling it needs everything it imports — whether or not the app depends on it directly.
 */
function builtByDockerfile(dockerfile) {
  return [...dockerfile.matchAll(/pnpm --filter (?<name>@repo\/[a-z0-9-]+) build/gu)]
    .map((match) => match.groups.name)
    .filter((name) => name !== '@repo/api' && name !== '@repo/web');
}

/** Everything `seeds` needs compiled, following `dependencies` edges to a fixed point. */
function closureOf(seeds) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    for (const next of workspaceDepsOf(name)) queue.push(next);
  }
  return seen;
}

const problems = [];
const required = new Set();

for (const app of APPS) {
  const dockerfile = read(app.dockerfile);
  const runtime = runtimeWorkspaceDeps(app.pkg);
  // The CI step below runs the app FROM SOURCE, so it needs only what the apps import at runtime.
  for (const dep of closureOf(runtime)) required.add(dep);
  // The Dockerfile's obligation is wider: the closure over its runtime deps AND whatever it has
  // already chosen to build — see the transitive note in the docblock above. A package that is in
  // the image chain for a build-time reason (`@repo/seed`, in the web tsconfig) is deliberately NOT
  // added to `required`, because the CI e2e job neither builds an image nor imports it.
  //
  // COPY and build take the SAME set. An earlier version of this gate checked COPY over the app's
  // direct dependencies only, on the reasoning that a package reached through the closure "is
  // already COPYd by whichever manifest names it". That is false, and asserting it cost a CI round:
  // being named in another package's manifest does not put YOUR manifest in the image, so
  // `pnpm install --frozen-lockfile --filter <app>...` never installs your dependencies and your
  // build fails inside your own sources, on missing types, several layers from the cause.
  for (const dep of [...closureOf([...runtime, ...builtByDockerfile(dockerfile)])].sort()) {
    const dir = dep.replace('@repo/', 'packages/');
    if (!dockerfile.includes(`COPY ${dir}/package.json`)) {
      problems.push(
        `${app.dockerfile}: missing \`COPY ${dir}/package.json ${dir}/\` in the deps stage ` +
          `(reached from ${app.name}'s dependencies or from a package this Dockerfile builds).`,
      );
    }
    if (!dockerfile.includes(`pnpm --filter ${dep} build`)) {
      problems.push(
        `${app.dockerfile}: missing \`pnpm --filter ${dep} build\` in the build stage ` +
          `(reached from ${app.name}'s dependencies or from a package this Dockerfile builds).`,
      );
    }
  }
}

// The e2e job runs the build commands directly (no Turbo), so it needs the union of both apps'.
const ci = read(CI_WORKFLOW);
const buildStep = /- name: Build shared packages\n\s+run: (?<run>.*)\n/u.exec(ci)?.groups?.run;
if (buildStep === undefined) {
  problems.push(`${CI_WORKFLOW}: no "Build shared packages" step found — has it been renamed?`);
} else {
  for (const dep of [...required].sort()) {
    if (!buildStep.includes(`pnpm --filter ${dep} build`)) {
      problems.push(
        `${CI_WORKFLOW}: "Build shared packages" does not build ${dep}, which an app depends on.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('Build contract (ADR-0019) is not satisfied:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    '\nAdd the missing line(s). A local checkout hides this — the package already has a dist/.',
  );
  process.exit(1);
}

console.log(
  `Build contract OK — ${String(required.size)} shared package(s) built by every consumer ` +
    `(${[...required].sort().join(', ')}).`,
);
