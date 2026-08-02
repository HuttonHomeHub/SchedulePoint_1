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

const problems = [];
const required = new Set();

for (const app of APPS) {
  const dockerfile = read(app.dockerfile);
  for (const dep of runtimeWorkspaceDeps(app.pkg)) {
    required.add(dep);
    const dir = dep.replace('@repo/', 'packages/');
    if (!dockerfile.includes(`COPY ${dir}/package.json`)) {
      problems.push(
        `${app.dockerfile}: missing \`COPY ${dir}/package.json ${dir}/\` in the deps stage ` +
          `(${app.name} depends on ${dep}).`,
      );
    }
    if (!dockerfile.includes(`pnpm --filter ${dep} build`)) {
      problems.push(
        `${app.dockerfile}: missing \`pnpm --filter ${dep} build\` in the build stage ` +
          `(${app.name} depends on ${dep}).`,
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
