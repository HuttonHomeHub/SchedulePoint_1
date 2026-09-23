/**
 * NetPoint-layout M4-T2, FC-N0: run `netpoint-agreement.ts` and fail unless every case agrees.
 * `node scripts/measure-netpoint-agreement.mjs` from `apps/web`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'sp-netpoint-agreement-'));
const file = join(out, 'agreement.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/netpoint-agreement.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${file}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { agreement } = await import(pathToFileURL(file).href);
const rows = agreement();
let failed = 0;
for (const r of rows) {
  console.log(`${r.ok ? 'AGREE   ' : 'DISAGREE'} ${r.name}`);
  console.log(`  harness ${r.harness}`);
  if (!r.ok) {
    console.log(`  product ${r.product}`);
    failed += 1;
  }
}
console.log(
  failed === 0
    ? `\nFC-N0: PASS (${rows.length} of ${rows.length} agree)`
    : `\nFC-N0: FAIL (${failed} disagree)`,
);
process.exit(failed === 0 ? 0 : 1);
