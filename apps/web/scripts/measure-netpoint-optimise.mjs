/**
 * NetPoint-layout M4-T3: run the product optimiser on the M0 fixtures.
 * `PLANS=small,unit node scripts/measure-netpoint-optimise.mjs` from `apps/web`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'sp-netpoint-optimise-'));
const file = join(out, 'run.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/netpoint-optimise-run.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${file}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { run } = await import(pathToFileURL(file).href);
console.log(
  `[NetPoint-layout M4-T3] node ${process.version}, ${new Date().toISOString()}, commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`,
);
for (const r of run(process.env.PLANS ?? 'small,unit')) console.log(JSON.stringify(r));
