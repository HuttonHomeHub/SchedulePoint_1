import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The one place a measurement script bundles a probe into a temp directory (`docs/TECH_DEBT.md`
 * #371). Every harness used to repeat these lines verbatim.
 *
 * **The esbuild CLI, not its JS API.** esbuild is a transitive dependency of Vite, not a direct one,
 * so under pnpm's strict layout a script cannot `import` it — and a direct dependency for hand-run
 * scripts would be a real cost for no gain. `pnpm exec` resolves the binary from `apps/web`, which
 * is why callers run with that as the working directory and pass entries as `scripts/….ts`.
 *
 * **Nothing is cleaned up**, as before: the directory is left under the OS temp root, where a
 * reader can open the bundle that produced a number. Flags are passed by each caller because they
 * genuinely differ (node-side ESM versus browser IIFE, a `--define`, resolve extensions); this
 * module does not normalise them.
 */

/** A probe that runs under node. */
export const NODE_ESM = ['--format=esm', '--platform=node'];

/** A bench loaded into a page with `addScriptTag`. */
export const BROWSER_IIFE = ['--format=iife', '--target=chrome120'];

/** Creates the directory a script bundles into. */
export function makeProbeDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Bundles `entry` to `outfile` and returns `outfile`. `flags` sit between `--bundle` and the output. */
export function esbuildBundle(entry, outfile, flags) {
  execFileSync(
    'pnpm',
    ['exec', 'esbuild', entry, '--bundle', ...flags, `--outfile=${outfile}`, '--log-level=warning'],
    { stdio: 'inherit' },
  );
  return outfile;
}

/**
 * A fresh directory plus one bundle in it, for the common case of a single entry.
 * Returns `{ dir, bundle }`; `dir` is for scripts that write more files beside the bundle.
 */
export function bundleProbe(entry, { prefix, outName, flags }) {
  const dir = makeProbeDir(prefix);
  return { dir, bundle: esbuildBundle(entry, join(dir, outName), flags) };
}
