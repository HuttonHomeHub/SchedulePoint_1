/**
 * NetPoint-layout M4-T3: run the product optimiser on the M0 fixtures.
 * `PLANS=small,unit node scripts/measure-netpoint-optimise.mjs` from `apps/web`.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bundleProbe, NODE_ESM } from './bundle-probe.mjs';

const { bundle: file } = bundleProbe('scripts/netpoint-optimise-run.ts', {
  prefix: 'sp-netpoint-optimise-',
  outName: 'run.mjs',
  flags: NODE_ESM,
});
const { run } = await import(pathToFileURL(file).href);
console.log(
  `[NetPoint-layout M4-T3] node ${process.version}, ${new Date().toISOString()}, commit ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}`,
);
for (const r of run(process.env.PLANS ?? 'small,unit')) console.log(JSON.stringify(r));
