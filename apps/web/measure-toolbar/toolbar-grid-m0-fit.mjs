/**
 * The column-fit table for `docs/specs/toolbar-grid/m0-measurement.md` (toolbar-grid M0-T1 item 2).
 * Not a gate and not run by CI: it reads what `toolbar-grid-m0.spec.ts` wrote and prints markdown.
 *
 *   M0_TAG=before pnpm measure:toolbar -- toolbar-grid-m0
 *   node measure-toolbar/toolbar-grid-m0-fit.mjs before            (or any other tag)
 *
 * What it applies is spec §4.5's rule, literally and then strictly:
 *
 * - **Literal.** `column = max(LOOK lead, DO lead)`, each lead taken in its widest state. The narrower
 *   row's `pad = column - its lead (widest state)`; its room is its worst-state free width (the
 *   unused width after promotion, the real deck at the stage cell) less `safetyPx`. The column fits
 *   when `pad <= room`.
 * - **Strict (SC-10).** The same column set against every state of both rows: in state `s` row `r`
 *   gains `column - lead(r, s)`, and must keep `free(r, s) - safetyPx >= 0` or the column costs a line
 *   in that state. This is the reading that decides whether a column can ship, because a row's lead
 *   is narrower in states other than its widest (the pen not held, no Add armed).
 *
 * Two variants: **A** takes every state, the armed ones included (the spec's "the column uses the widest
 * measured state"); **B** leaves the two armed states out, so an armed tool grows its own row rather
 * than setting the column. A stage cell is the narrowest window of its stage, so it is where the room
 * is least.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../measure-output');
const TAG = process.argv[2] ?? 'before';
/** `promotion-widths.*.json`'s `safetyPx`. */
const SAFETY = 2;

const STAGES = [
  ['PROMOTE_80', '1280x800'],
  ['PROMOTE_90', '1440x900'],
  ['PROMOTE_100', '1600x900'],
  ['PROMOTE_119_5', '1912x1080'],
  ['PROMOTE_135', '2160x1200'],
  ['PROMOTE_160', '2560x1440'],
];
/** Informational: the owner's window, inside PROMOTE_100. */
const EXTRA = [['(1646, in PROMOTE_100)', '1646x1097']];

/** States in which a tool is armed. Their Add / Link label is the longest, and they are transient. */
const ARMED = new Set(['add-armed', 'link-armed']);

const r1 = (n) => Math.round(n * 10) / 10;
const lead = (reading, row) => {
  const n = reading.natural[row];
  const first = n.groups[0];
  if (!first) throw new Error(`${row}: no groups at ${reading.cell}`);
  return { name: first.name, w: first.w, free: n.free, natural: n.natural };
};

/** Spec §4.5's rule over a subset of states. */
function evaluate(look, dos) {
  const lw = Math.max(...look.map((x) => x.w));
  const dw = Math.max(...dos.map((x) => x.w));
  const column = Math.max(lw, dw);
  const narrowerIsLook = lw < dw;
  const narrower = narrowerIsLook ? look : dos;
  const nlead = Math.max(...narrower.map((x) => x.w));
  const worstFree = Math.min(...narrower.map((x) => x.free));
  const pad = column - nlead;
  const room = worstFree - SAFETY;
  let binding = { slack: Infinity, row: '', state: '' };
  for (const [row, list] of [
    ['look', look],
    ['do', dos],
  ]) {
    for (const x of list) {
      const slack = x.free - SAFETY - (column - x.w);
      if (slack < binding.slack) binding = { slack, row, state: x.state };
    }
  }
  return {
    lw,
    dw,
    column,
    narrowerIsLook,
    pad,
    room,
    literal: pad <= room,
    strict: binding.slack >= 0,
    binding,
  };
}

const summary = {};
for (const pointer of ['fine', 'coarse']) {
  const data = JSON.parse(
    readFileSync(resolve(OUT, `toolbar-grid-m0-${TAG}.${pointer}.json`), 'utf8'),
  );
  const states = [...new Set(data.cells.map((c) => c.state))];
  const detail = [];
  for (const variant of ['A', 'B']) {
    console.log(
      variant === 'A'
        ? `\n### ${pointer} pointer, ${TAG}: variant A, every state including the armed ones (spec 4.5 literally)\n`
        : `\n### ${pointer} pointer, ${TAG}: variant B, the armed states left out (an armed tool grows its own row; nothing sets the column from it)\n`,
    );
    console.log(
      '| Stage | Cell | LOOK lead | DO lead | Column | Narrower row | Pad | Room (worst free - 2) | Fits (literal) | Fits every state (strict) | Binding (row / state / slack) |',
    );
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const [stage, cell] of [...STAGES, ...EXTRA]) {
      const at = data.cells.filter(
        (c) => c.cell === cell && (variant === 'A' || !ARMED.has(c.state)),
      );
      if (at.length === 0) continue;
      const per = (row) =>
        at.map((c) => ({
          state: c.state,
          ...lead(c, row),
          lines: c.rows.find((x) => x.row === row).lines,
        }));
      const look = per('look');
      const dos = per('do');
      const e = evaluate(look, dos);
      console.log(
        `| ${stage} | ${cell} | ${look[0].name} ${r1(e.lw)} | ${dos[0].name} ${r1(e.dw)} | ${r1(e.column)} | ${e.narrowerIsLook ? 'LOOK' : 'DO'} | ${r1(e.pad)} | ${r1(e.room)} | ${e.literal ? 'yes' : 'NO'} | ${e.strict ? 'yes' : 'NO'} | ${e.binding.row} / ${e.binding.state} / ${r1(e.binding.slack)} |`,
      );
      summary[`${pointer} ${variant} ${cell}`] = { literal: e.literal, strict: e.strict };
      if (variant === 'A') detail.push({ stage, cell, look, dos });
    }
  }

  console.log(
    `\n#### ${pointer}: lead width / free width per state (px; lines in brackets when not 1)\n`,
  );
  console.log(`| Stage | Cell | Row | ${states.join(' | ')} |`);
  console.log(`| --- | --- | --- | ${states.map(() => '---').join(' | ')} |`);
  for (const d of detail) {
    for (const [row, list] of [
      ['LOOK', d.look],
      ['DO', d.dos],
    ]) {
      const cells = states.map((s) => {
        const x = list.find((y) => y.state === s);
        return x ? `${r1(x.w)} / ${r1(x.free)}${x.lines === 1 ? '' : ` [${x.lines}]`}` : '-';
      });
      console.log(`| ${d.stage} | ${d.cell} | ${row} (${list[0].name}) | ${cells.join(' | ')} |`);
    }
  }
}
const fits = Object.entries(summary)
  .filter(([, v]) => v.strict)
  .map(([k]) => k);
console.log(`\nFits strictly (every state): ${fits.length === 0 ? 'nowhere' : fits.join('; ')}`);
