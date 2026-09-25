#!/usr/bin/env node
/**
 * **Links-and-labels M0-T2 — list the opposed pairs phase 3 leaves.**
 *
 *   node scripts/measure-opposed.mjs            (from apps/web)
 *   node scripts/measure-opposed.mjs --json
 *
 * Runs `opposed-probe.ts` on the four attachment fixtures at 1, 4 and 12 px/day, pan 32 (every
 * count agreed across pans at M0, `docs/specs/links-and-labels/m0-baseline.md`), and prints each
 * pair with its kind, whether an end offset could absorb it, and each link's best escape.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const json = process.argv.includes('--json');
const out = mkdtempSync(join(tmpdir(), 'sp-opposed-'));
const entry = join(out, 'entry.ts');
writeFileSync(
  entry,
  `export { listOpposed } from ${JSON.stringify(`${process.cwd()}/scripts/opposed-probe.ts`)};
export { fixtures } from ${JSON.stringify(`${process.cwd()}/scripts/attachment-probe.ts`)};
`,
);
const bundle = join(out, 'probe.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const probe = await import(pathToFileURL(bundle).href);
const rows = [];
for (const fx of probe.fixtures(FIXTURE)) {
  for (const pxPerDay of [1, 4, 12]) {
    const pairs = probe.listOpposed(fx.scene, { pxPerDay, originX: 40, originY: 32 });
    rows.push({ fixture: fx.name, pxPerDay, pairs });
  }
}
if (json) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  for (const r of rows) {
    const byKind = {};
    for (const p of r.pairs) {
      const k = `${p.kind}${p.orientation === 'h' ? ' (h)' : ''}${p.absorbable ? ' absorbable' : ''}`;
      byKind[k] = (byKind[k] ?? 0) + 1;
    }
    console.log(
      `${r.fixture.padEnd(20)} ${String(r.pxPerDay).padStart(3)} px/day  ${r.pairs.length} pairs  ${JSON.stringify(byKind)}`,
    );
  }
}
