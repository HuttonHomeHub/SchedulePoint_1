#!/usr/bin/env node
/**
 * **Node-to-node links M0-T3 — the attachment baseline, and FC-T0.**
 *
 *   node scripts/measure-attachment.mjs            (from apps/web)
 *   node scripts/measure-attachment.mjs --json     (machine-readable, for m2-verdict)
 *
 * Reads `attachment-probe.ts` on the four fixtures of `docs/specs/node-to-node-links/feature-spec.md`
 * §4.9 at zooms {1, 4, 12} and pans {0, 32, 200, 500}, the grid `measure-occlusion.mjs` uses.
 *
 * **Two controls, both throwing.** Every edge is routed and painted (`links === painted === edges`),
 * because a figure taken over part of a plan rewards culling the evidence. And no segment is diagonal
 * while M4 has not run (FC-T9), because a diagonal is invisible to every orthogonal counter here.
 *
 * **FC-T0, the non-vacuity condition**, is judged at the end: on today's code the unattached count
 * must be positive on every fixture and both of the brief's cases must be named. Without that, a zero
 * after M2 would mean nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const json = process.argv.includes('--json');

const out = mkdtempSync(join(tmpdir(), 'sp-attach-'));
const bundle = join(out, 'probe.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/attachment-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const probe = await import(pathToFileURL(bundle).href);
probe.selfTest();
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();

const rows = [];
for (const fx of probe.fixtures(FIXTURE)) {
  for (const pxPerDay of [1, 4, 12]) {
    for (const originY of [0, 32, 200, 500]) {
      const view = { pxPerDay, originX: 40, originY };
      const r = probe.readAttachment(fx.scene, view, fx.sizeAt(pxPerDay, originY));
      if (r.links !== r.edges || r.painted !== r.edges) {
        throw new Error(
          `VACUOUS: ${fx.name} at ${pxPerDay} px/day, pan ${originY}: ${r.links} routed, ` +
            `${r.painted} painted, ${r.edges} edges. Refusing to judge.`,
        );
      }
      if (r.diagonal !== 0) {
        throw new Error(`FC-T9: ${r.diagonal} diagonal segments on ${fx.name}. Refusing to judge.`);
      }
      rows.push({ fixture: fx.name, pxPerDay, originY, ...r });
    }
  }
}

if (json) {
  process.stdout.write(`${JSON.stringify({ commit, rows }, null, 2)}\n`);
} else {
  console.log(`\n[node-to-node links / attachment] node, ${new Date().toISOString()}`);
  console.log(`  commit ${commit}\n`);
  const h = [
    'fixture'.padEnd(18),
    'zoom'.padStart(4),
    'pan'.padStart(4),
    'links'.padStart(5),
    'unatt'.padStart(5),
    'ends'.padStart(5),
    'falseJ'.padStart(6),
    'ovl'.padStart(4),
    'text'.padStart(5),
    'gap'.padStart(4),
    'plate'.padStart(5),
    'x/link'.padStart(6),
    'occl'.padStart(5),
    'bends'.padStart(5),
    'fingerprint'.padStart(12),
  ];
  console.log(`  ${h.join(' ')}`);
  for (const r of rows) {
    console.log(
      `  ${r.fixture.padEnd(18)} ${String(r.pxPerDay).padStart(4)} ${String(r.originY).padStart(4)} ` +
        `${String(r.links).padStart(5)} ${String(r.unattachedLinks).padStart(5)} ` +
        `${String(r.unattachedEnds).padStart(5)} ${String(r.falseJunctions).padStart(6)} ` +
        `${String(r.overlaps).padStart(4)} ${String(r.textCrossings).padStart(5)} ` +
        `${String(r.gapLabels).padStart(4)} ${String(r.lagPlates).padStart(5)} ` +
        `${r.crossingsPerLink.toFixed(3).padStart(6)} ${String(r.foreignOccludedLinks).padStart(5)} ` +
        `${String(r.bends).padStart(5)} ${r.fingerprint.padStart(12)}`,
    );
  }
  console.log('\n  reasons (4 px/day, pan 32):');
  for (const r of rows.filter((x) => x.pxPerDay === 4 && x.originY === 32)) {
    console.log(`    ${r.fixture.padEnd(18)} ${JSON.stringify(r.byReason)}`);
    for (const e of r.examples) console.log(`      ${e}`);
  }

  // FC-T0: non-vacuity, judged on this reading.
  const byFixture = new Map();
  for (const r of rows)
    byFixture.set(r.fixture, (byFixture.get(r.fixture) ?? 0) + r.unattachedEnds);
  const brief = rows.filter((r) => r.fixture === 'brief');
  const named = (case_) => brief.every((r) => r.examples.some((e) => e.startsWith(case_)));
  const t0 =
    [...byFixture.values()].every((n) => n > 0) &&
    named('Foundations->Frame') &&
    named('Frame->Roof');
  console.log(
    `\n  FC-T0 (non-vacuity): ${t0 ? 'FIRES' : 'DOES NOT FIRE'} — unattached ends per fixture ` +
      `${JSON.stringify(Object.fromEntries(byFixture))}; brief cases named at every framing: ` +
      `Foundations->Frame ${named('Foundations->Frame') ? 'yes' : 'NO'}, Frame->Roof ` +
      `${named('Frame->Roof') ? 'yes' : 'NO'}.\n`,
  );
}
