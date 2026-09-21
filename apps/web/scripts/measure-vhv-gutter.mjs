#!/usr/bin/env node
/**
 * Drive `vhv-gutter-probe.ts` in **node** and print FC-1's answer.
 *
 *   node scripts/measure-vhv-gutter.mjs [count[,count...]]
 *
 * See the probe's own docblock for why this is not a Chromium harness (the plan said it should be;
 * the code says a browser buys nothing here) and for what the stub context does not establish.
 *
 * **The non-vacuity control is the first thing checked and the harness THROWS rather than judging
 * when it has nothing to judge** — ADR-0130's rule, after ADR-0097 Landing C produced a `PROCEED`
 * from an `undefined` because the edit that was supposed to supply the number had silently failed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const counts = (process.argv[2] ?? '500,2000').split(',').map((n) => Number(n.trim()));
if (counts.some((n) => !Number.isFinite(n) || n <= 0)) {
  console.error(`Bad counts "${process.argv[2]}" — expected e.g. 500,2000`);
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), 'sp-vhv-'));
const bundle = join(out, 'probe.mjs');

// The esbuild CLI rather than its JS API, for the reason `measure-link-routing.mjs` records: it is
// a transitive dependency of Vite, so under pnpm's strict layout this file cannot import it.
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/vhv-gutter-probe.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

try {
  const { probe } = await import(pathToFileURL(bundle).href);
  const result = probe(counts);

  // ---- the non-vacuity control, FIRST ----
  if (result.framings.length === 0) {
    throw new Error('FC-1 INDETERMINATE: the probe examined no framings at all.');
  }
  const painted = result.framings.reduce((n, f) => n + f.polylines, 0);
  if (painted === 0) {
    throw new Error(
      'FC-1 INDETERMINATE: the painter drew no polylines at all, so this run measures nothing. ' +
        'Check the scene and the viewport before reading any number below.',
    );
  }

  const head =
    `\n[diagram-legibility M0-T2 / FC-1] node, ${new Date().toISOString()}\n` +
    `  commit   ${execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()}\n` +
    `  counts   ${counts.join(', ')}\n` +
    `  NOTE     None of these fixtures is the plan from the product owner's screenshot (CQ-4).\n` +
    `           They are the ADR-0066 scale generator's programmes. The scale scene deals bands\n` +
    `           into a fixed 50 lanes and never calls packLanes, so it is a plausible layout\n` +
    `           rather than a packed one; M0-T3 supplies the packed case.\n`;

  const rows = result.framings.map((f) => {
    const n = f.deltas.length;
    const uniq = [...new Set(f.deltas.map((d) => Number(d.toFixed(3))))];
    const deltaText =
      n === 0
        ? '—'
        : uniq.length === 1
          ? `${uniq[0] > 0 ? '+' : ''}${String(uniq[0])} px (all ${String(n)})`
          : `${String(uniq.length)} distinct: ${uniq.slice(0, 4).join(', ')}${uniq.length > 4 ? ' …' : ''}`;
    return (
      `  ${String(f.activities).padStart(5)} act  ${f.viewport.padEnd(9)} ` +
      `${String(f.pxPerDay).padStart(2)}px/d  originY ${String(f.originY).padStart(6)}  ` +
      `polylines ${String(f.polylines).padStart(5)}  VHV ${String(f.vhv).padStart(4)}  ` +
      `off-canvas ${String(f.offCanvas).padStart(4)}  delta ${deltaText}`
    );
  });

  // ---- FC-1 limb 1 ----
  if (result.totalVhv === 0) {
    console.log(head + rows.join('\n'));
    console.log(
      `\n  FC-1 limb 1 FAILS — the VHV fallback fired on ZERO edges at every framing measured.\n` +
        `  Per FC-1's withdrawal clause the defect is LATENT rather than the reported one:\n` +
        `  M1 still ships as a correctness fix, the attribution in the spec's §0.2 is withdrawn\n` +
        `  IN PLACE rather than deleted, and the diagnosis of the screenshot RE-OPENS.\n` +
        `  This is not a pass and not a failure of the fix — it is a failure of the attribution.\n`,
    );
    process.exit(0);
  }

  // ---- FC-1 limb 2 ----
  const byOrigin = new Map();
  for (const f of result.framings) {
    if (f.deltas.length === 0) continue;
    const want = -2 * f.originY;
    const ok = f.deltas.every((d) => Math.abs(d - want) <= 0.5);
    const prev = byOrigin.get(f.originY) ?? { ok: true, want, n: 0 };
    byOrigin.set(f.originY, { ok: prev.ok && ok, want, n: prev.n + f.deltas.length });
  }
  const limb2 = [...byOrigin.entries()].map(
    ([originY, v]) =>
      `    originY ${String(originY).padStart(6)}  expected delta ${String(v.want).padStart(6)} px  ` +
      `over ${String(v.n).padStart(4)} legs  ${v.ok ? 'MATCHES' : 'DOES NOT MATCH'}`,
  );
  const allOk = [...byOrigin.values()].every((v) => v.ok);

  console.log(head + rows.join('\n'));
  console.log(
    `\n  FC-1 limb 1: the VHV fallback fired on ${String(result.totalVhv)} edges across the sweep — PASSES.\n` +
      `  FC-1 limb 2: each leg's y against the screenYOfLane-consistent value:\n${limb2.join('\n')}\n` +
      `\n  FC-1 ${allOk ? 'PASSES' : 'FAILS'}.\n` +
      (allOk
        ? `  The displacement is exactly 2 x originY, so the gutter leg is computed in a frame\n` +
          `  that negates the viewport origin instead of adding it.\n\n` +
          `  What this does NOT establish: that a planner has SEEN it. A leg displaced 64 px at\n` +
          `  rest is wrong without necessarily being the reported screenshot; the larger pans are\n` +
          `  in the sweep for that reason, and the off-canvas column is the closest this harness\n` +
          `  comes to the question.\n`
        : `  The displacement is NOT the predicted 2 x originY. The spec's §0.2 arithmetic is\n` +
          `  wrong or incomplete and must be re-read before M1 changes anything.\n`),
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
