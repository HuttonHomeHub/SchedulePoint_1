/**
 * Swimlanes M0-T4: partitioned Tidy and Re-layout, measured in node.
 * `CASES=power,torture,scale500 node scripts/measure-swimlane-arrange.mjs` from `apps/web`; set
 * `OUT=<dir>` to also write the lanes (`lanes.json`) and the schematic pictures there.
 * Needs the `@repo/*` packages built (`pnpm --filter "./packages/*" build`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'sp-swimlane-arrange-'));
const file = join(out, 'run.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/netpoint-swimlane-run.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--resolve-extensions=.ts,.js,.mjs,.json',
    `--outfile=${file}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { run, renderPictures } = await import(pathToFileURL(file).href);
console.log(
  `[swimlanes M0-T4] node ${process.version}, ${new Date().toISOString()}, commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`,
);
const result = run(process.env.CASES ?? 'power,torture,scale500');
for (const c of result.checks) console.log(`check ${c}`);
for (const r of result.rows) console.log(JSON.stringify(r));
if (process.env.OUT) {
  mkdirSync(process.env.OUT, { recursive: true });
  writeFileSync(join(process.env.OUT, 'lanes.json'), JSON.stringify(result.lanes));
  for (const [name, svg] of Object.entries(renderPictures(result))) {
    writeFileSync(join(process.env.OUT, name), svg);
  }
}
if (result.rows.some((r) => !r.repeatable)) {
  console.error('NOT REPEATABLE: two runs returned different lanes');
  process.exit(1);
}
