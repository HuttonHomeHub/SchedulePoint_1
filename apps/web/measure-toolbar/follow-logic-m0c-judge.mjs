/**
 * Judges the M0c readings against amendment 2's stop rules S1 to S5
 * (`docs/specs/placed-bar-follows-link/amendment-2-after-m0b.md` section 3). Reads the two JSON files
 * the probe wrote (`follow-logic-m0c-offer-row.spec.ts`) and prints, per rule, how many readings fire
 * it and the cell that decides it. Every comparison is against the SAME cell's base reading.
 *
 *   node measure-toolbar/follow-logic-m0c-judge.mjs [readings-dir]
 *
 * A harness, not a gate: it prints and always exits 0, because a verdict is for a reader to record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(process.cwd(), 'measure-output');
const load = (pointer) =>
  JSON.parse(readFileSync(join(dir, `follow-logic-m0c-offer-row.${pointer}.json`), 'utf8'));

const sideways = (x) =>
  Boolean(x.footScrollsSideways || x.pageScrollsSideways || x.shellScrollsSideways);
const keyOf = (x) => [x.cell, x.selection, x.factsVariant ?? '', x.message ?? ''].join(' | ');
const A = (x) => x.mode === 'A-prime';
const isBase = (x) => x.variant === 'base' || x.mode === 'none';

/** Pair every A-prime reading with its cell's base reading. */
function paired(list) {
  const bases = new Map();
  for (const x of list) if (isBase(x)) bases.set(keyOf(x), x);
  return list.filter((x) => A(x) && x.strip).map((x) => ({ x, base: bases.get(keyOf(x)) }));
}

const rules = { S1: [], S2: [], S3: [], S4: [], S5: [] };
const cellName = (pointer, view, x) =>
  `${pointer} ${view} ${x.cell} ${x.selection}${x.factsVariant ? ` ${x.factsVariant}` : ''} ${x.variant}`;

for (const pointer of ['fine', 'coarse']) {
  let data;
  try {
    data = load(pointer);
  } catch {
    console.log(`(no ${pointer} readings)`);
    continue;
  }
  const lists100 = [
    ['diagram', data.diagram],
    ['gantt', data.gantt],
    ['facts-widened', data.factsWidened ?? []],
  ];
  for (const [view, list] of lists100) {
    for (const { x, base } of paired(list)) {
      if (!base) continue;
      const name = cellName(pointer, view, x);
      const buttons = x.stripButtons ?? [];
      const missed = buttons.filter((b) => !b.selfHitAfterScroll).map((b) => b.text);
      if (missed.length > 0)
        rules.S1.push({ name, why: `not self-hit after scroll: ${missed.join(', ')}` });
      if (sideways(x) && !sideways(base)) rules.S1.push({ name, why: 'adds sideways scroll' });
      const cost = x.footH - base.footH;
      const extra = cost - x.strip.h - (x.strip.stackedWithBar ? 8 : 0);
      if (extra > 4)
        rules.S2.push({
          name,
          why: `extra ${Math.round(extra * 10) / 10} (cost ${cost}, strip ${x.strip.h})`,
          extra,
        });
      if (x.selection === 'none' && x.stageH < 120) {
        rules.S3.push({ name, why: `stage ${x.stageH} (base ${base.stageH})` });
      }
      const limit = x.variant === 'link-confirmation-plus-offer' ? 3 : 2;
      if (x.strip.textLines > limit)
        rules.S4.push({ name, why: `${x.strip.textLines} lines (limit ${limit})` });
    }
  }
  for (const [route, list] of [
    ['root-font', data.text200],
    ['browser-setting', data.text200cdp],
    ['gantt-root-font', data.ganttText200 ?? []],
  ]) {
    for (const { x, base } of paired(list)) {
      if (!base) continue;
      const name = `${cellName(pointer, route, x)}`;
      const toggleOk = Boolean(base.toggle?.selfHitAfterScroll);
      const missed = (x.stripButtons ?? []).filter((b) => !b.selfHitAfterScroll).map((b) => b.text);
      if (missed.length > 0 && toggleOk)
        rules.S5.push({
          name,
          why: `not self-hit after scroll (base toggle is): ${missed.join(', ')}`,
        });
      if (sideways(x) && !sideways(base))
        rules.S5.push({ name, why: 'adds sideways scroll the base lacks' });
      if (x.selection === 'none' && x.stageH < 120 && base.stageH >= 120) {
        rules.S5.push({ name, why: `stage ${x.stageH} (base ${base.stageH})` });
      }
    }
  }
}

for (const [rule, hits] of Object.entries(rules)) {
  console.log(`\n${rule}: ${hits.length === 0 ? 'HOLDS' : `FIRES (${hits.length} readings)`}`);
  const worst = rule === 'S2' ? [...hits].sort((a, b) => b.extra - a.extra) : hits;
  for (const h of worst.slice(0, 12)) console.log(`  ${h.name}: ${h.why}`);
}

// Supporting readings: R0, the S2 width band, the R1 control, and row 580. Printed, never judged.
const fine = (() => {
  try {
    return load('fine');
  } catch {
    return null;
  }
})();
if (fine) {
  console.log('\nR0 (fine): the same strip, only the facts differ');
  for (const x of fine.r0Controlled ?? []) {
    console.log(
      `  ${x.what}: outlet ${x.outletW}, foot ${x.footH}, facts ${x.facts.state} ${x.facts.w}`,
    );
  }
  console.log('R0 (fine): the live Linked band, as read');
  for (const x of fine.r0) {
    console.log(
      `  ${x.what}: outlet ${x.outletW}, foot ${x.footH}, facts ${x.facts.state} ${x.facts.w}`,
    );
  }
  console.log(`  recalculate was requested by: ${fine.r0Recalculate}`);
  const seen = [];
  for (const s of fine.r0Series ?? []) {
    const k = `${s.state} outlet ${s.outletW} foot ${s.footH} facts ${s.factsW}`;
    if (seen[seen.length - 1] !== k) seen.push(k);
  }
  console.log(
    `  100 ms series after Ctrl+Z at 1024 (${fine.r0Series?.length ?? 0} samples), distinct: ${seen.join(' ; ')}`,
  );
}

for (const pointer of ['fine', 'coarse']) {
  let data;
  try {
    data = load(pointer);
  } catch {
    continue;
  }
  console.log(`\nS2 width band (${pointer}): extra px per window width, edit-one, a bar selected`);
  const byKey = new Map(data.band.map((x) => [`${x.cell}|${x.selection}|${x.variant}`, x]));
  for (const selection of ['placed-unflagged-selected', 'flagged-bar-selected']) {
    const cells = [...new Set(data.band.map((x) => x.cell))];
    const row = cells.map((cell) => {
      const base = byKey.get(`${cell}|${selection}|base`);
      const strip = byKey.get(`${cell}|${selection}|edit-one`);
      const extra = strip.footH - base.footH - strip.strip.h - (strip.strip.stackedWithBar ? 8 : 0);
      return `${cell.replace('x800', '')}:${extra}`;
    });
    console.log(`  ${selection}: ${row.join(' ')}`);
  }

  console.log(
    `R1 control (${pointer}): the base dock's own Expand toggle, in place and after scroll`,
  );
  for (const [route, list] of [
    ['root-font', data.text200],
    ['browser-setting', data.text200cdp],
    ['gantt-root-font', data.ganttText200],
  ]) {
    for (const x of list.filter((y) => y.variant === 'base')) {
      console.log(
        `  ${route} ${x.selection}: toggle in place ${x.toggle?.selfHitInPlace}, after scroll ${x.toggle?.selfHitAfterScroll}, top ${x.toggle?.top}; shell scrollTop ${x.shell?.scrollTop} of ${x.shell?.scrollHeight}/${x.shell?.clientHeight}, squat ${x.shell?.squat}; stage ${x.stageH}`,
      );
    }
    const shipped = list.filter((y) => y.mode === 'shipped');
    const buttons = shipped.flatMap((y) => y.stripButtons ?? []);
    console.log(
      `  ${route}: shipped strips ${shipped.length} readings, ${buttons.length} buttons, self-hit in place ${buttons.filter((b) => b.selfHitInPlace).length}, after scroll ${buttons.filter((b) => b.selfHitAfterScroll).length}`,
    );
  }

  console.log(`Row 580 (${pointer}), 1024x600: foot growth against the cell's base`);
  const baseOf = new Map();
  for (const x of data.messages) {
    if (x.mode === 'none')
      baseOf.set(`${x.cell}|${x.selection}|${x.message === 'bulk-bar' ? 'bulk' : ''}`, x);
  }
  for (const x of data.messages) {
    if (x.mode === 'none' || x.cell !== '1024x600') continue;
    const b = baseOf.get(`${x.cell}|${x.selection}|${x.message === 'bulk-bar' ? 'bulk' : ''}`);
    const hits = (x.stripButtons ?? []).map((q) => (q.selfHitAfterScroll ? 1 : 0)).join('');
    console.log(
      `  ${x.selection.slice(0, 7).padEnd(7)} ${x.message.padEnd(15)} ${x.mode.padEnd(10)} foot ${String(x.footH - b.footH).padStart(4)} stage ${String(x.stageH).padStart(3)} (base ${b.stageH}) lines ${x.strip.textLines} cut ${x.strip.textTruncated} strip ${x.strip.h} outlet ${x.outletW} hits ${hits} corner-in-stage ${x.cornerInsideStage}`,
    );
  }
}
