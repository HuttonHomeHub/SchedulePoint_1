/**
 * Judges the M0d readings against amendment 3's stop rules S1 to S7
 * (`docs/specs/placed-bar-follows-link/amendment-3-after-m0c.md` section 6). Reads the two JSON files
 * the probe wrote (`follow-logic-m0d-offer-row.spec.ts`) and prints, per rule, how many readings fire
 * it and the cell that decides it. Reads M0c's fine readings too, for the red-first check the amendment
 * asks of S6 (ADR-0110).
 *
 *   node measure-toolbar/follow-logic-m0d-judge.mjs [readings-dir]
 *
 * A harness, not a gate: it prints and always exits 0, because a verdict is for a reader to record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(process.cwd(), 'measure-output');
const load = (file) => {
  try {
    return JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch {
    return null;
  }
};
const round = (n) => Math.round(n * 10) / 10;

// ── S6 red-first: the rule must fire on M0c's own A-prime readings at 1250 before its verdict counts. ──
// M0c did not read the facts' top, so "the facts' line" is the strip's line when the strip is beside the
// facts (`aboveFacts` false): the amendment's own reading of l. 39667 (strip bottom 756, toggle top 756).
console.log('S6 RED-FIRST on M0c readings (A-prime, 1250 x 800)');
const redFirst = [];
for (const pointer of ['fine', 'coarse']) {
  const m0c = load(`follow-logic-m0c-offer-row.${pointer}.json`);
  if (!m0c) continue;
  for (const [view, list] of [
    ['diagram', m0c.diagram],
    ['gantt', m0c.gantt],
  ]) {
    for (const x of list) {
      if (x.cell !== '1250x800' || x.mode !== 'A-prime' || !x.strip || !x.toggle) continue;
      const stranded = x.toggle.top >= x.strip.bottom - 2 && x.strip.aboveFacts === false;
      redFirst.push({ pointer, view, x, stranded });
    }
  }
}
const redFiring = redFirst.filter((e) => e.stranded);
for (const pointer of ['fine', 'coarse']) {
  const mine = redFirst.filter((e) => e.pointer === pointer);
  if (mine.length === 0) continue;
  const fired = mine.filter((e) => e.stranded);
  console.log(
    `  ${pointer}: S6 fires on ${fired.length} of ${mine.length} A-prime readings at 1250` +
      (fired.length > 0
        ? ` (e.g. ${fired[0].view} ${fired[0].x.selection} ${fired[0].x.variant}: toggle top ${fired[0].x.toggle.top}, strip bottom ${fired[0].x.strip.bottom})`
        : ''),
  );
}
const redWithBar = redFiring.filter((e) => e.x.selection !== 'none' && e.pointer === 'fine');
console.log(
  `  fine, a bar selected: ${redWithBar.length} readings fire (M0c's S2 fired on 20 of them: 2 selections x 2 views x 5 variants)`,
);
const m0cFine = load('follow-logic-m0c-offer-row.fine.json');
const at1260 = (m0cFine?.band ?? []).filter(
  (x) => x.cell === '1260x800' && x.mode === 'A-prime' && x.strip && x.toggle,
);
const at1260Fire = at1260.filter(
  (x) => x.toggle.top >= x.strip.bottom - 2 && x.strip.aboveFacts === false,
);
console.log(
  `  fine, 1260 x 800 (M0c's band, where the toggle fit): S6 fires on ${at1260Fire.length} of ${at1260.length} readings`,
);
const redOk = redWithBar.length > 0 && at1260Fire.length === 0;
console.log(
  `  RED-FIRST ${redOk ? 'ESTABLISHED: the rule fires on the defect it names and not where the toggle fit' : 'NOT ESTABLISHED: do not count the S6 verdict below'}`,
);

// ── M0d ──
const sideways = (x) =>
  Boolean(x.footScrollsSideways || x.pageScrollsSideways || x.shellScrollsSideways);
const keyOf = (x) => [x.set, x.view, x.cell, x.selection, x.factsVariant ?? ''].join(' | ');
const is200 = (x) => x.set.startsWith('text200');
const subject = (x) => x.mode === 'A-double-prime' || x.mode === 'own-row';

/** S2's expected cost of the strip, amendment 3 section 6 rule 2. */
function s2(x, baseG) {
  const cost = x.footH - baseG.footH;
  const h = x.strip.h;
  let expected;
  let kind;
  if (x.message === 'bulk-bar') {
    // The multi-select bar IS the selection element: reshaping it adds no strip, so nothing is expected.
    expected = 0;
    kind = 'reshaped bar';
  } else if (x.strip.stackedWithBar) {
    expected = h + 8;
    kind = 'under the bar';
  } else if (x.strip.sharesFactsLine) {
    expected = Math.max(0, h - baseG.footInnerH);
    kind = 'on the facts line';
  } else {
    expected = h;
    kind = 'own line';
  }
  return { cost: round(cost), expected: round(expected), extra: round(cost - expected), kind };
}

/** S6: the toggle's centre against the facts' item's centre, tolerance half a line. */
function s6(x) {
  if (!x.toggle || !x.facts || x.facts.itemTop === null) return null;
  const toggleC = x.toggle.top + x.toggle.h / 2;
  const factsC = x.facts.itemTop + x.facts.itemH / 2;
  const line = Math.max(x.facts.itemH, x.toggle.h);
  return { off: Math.abs(toggleC - factsC) > line / 2, gap: round(toggleC - factsC) };
}

const rules = { S1: [], S2: [], S3: [], S4: [], S5: [], S6: [], S7: [] };
const considered = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, S7: 0 };
const notes = [];
const label = (pointer, x) =>
  `${pointer} ${x.set} ${x.view} ${x.cell} ${x.selection}${x.factsVariant ? ` ${x.factsVariant}` : ''} ${x.mode === 'own-row' ? `own-row/${x.message}` : x.variant}`;
const all = {};

for (const pointer of ['fine', 'coarse']) {
  const data = load(`follow-logic-m0d-offer-row.${pointer}.json`);
  if (!data) {
    console.log(`(no ${pointer} readings)`);
    continue;
  }
  all[pointer] = data;
  const groups = new Map();
  for (const x of data.readings) {
    const k = keyOf(x);
    if (!groups.has(k)) groups.set(k, { base: null, baseG: null, subjects: [], shipped: [] });
    const g = groups.get(k);
    if (x.mode === 'base') g.base = x;
    else if (x.mode === 'base-grouped') g.baseG = x;
    else if (subject(x)) g.subjects.push(x);
    else if (x.mode === 'shipped') g.shipped.push(x);
  }
  for (const g of groups.values()) {
    const { base, baseG } = g;
    if (!base || !baseG) {
      notes.push(`${pointer}: a group without its base or base-grouped reading`);
      continue;
    }
    // S7: the group alone.
    {
      const cell = label(pointer, baseG);
      considered.S7 += 1;
      const taller = baseG.footH - base.footH;
      if (taller > 0.5)
        rules.S7.push({
          name: cell,
          why: `foot ${baseG.footH} against ${base.footH} (+${round(taller)})`,
          size: taller,
        });
      if (sideways(baseG) && !sideways(base))
        rules.S7.push({ name: cell, why: 'adds sideways scroll', size: 1 });
    }
    for (const x of g.subjects) {
      if (!x.strip) continue;
      const name = label(pointer, x);
      if (!is200(x)) {
        considered.S1 += 1;
        const missed = (x.stripButtons ?? [])
          .filter((b) => !b.selfHitAfterScroll)
          .map((b) => b.text);
        if (missed.length > 0)
          rules.S1.push({ name, why: `not self-hit after scroll: ${missed.join(', ')}`, size: 1 });
        if (sideways(x) && !sideways(base))
          rules.S1.push({ name, why: 'adds sideways scroll the base lacks', size: 1 });
        considered.S2 += 1;
        const e = s2(x, baseG);
        if (e.extra > 4)
          rules.S2.push({
            name,
            why: `extra ${e.extra} (cost ${e.cost} against base-grouped ${baseG.footH}, expected ${e.expected}, strip ${x.strip.h}, ${e.kind})`,
            size: e.extra,
          });
        if (x.selection === 'none') {
          considered.S3 += 1;
          if (x.stageH < 120)
            rules.S3.push({
              name,
              why: `stage ${x.stageH} (base ${base.stageH})`,
              size: 120 - x.stageH,
            });
        }
        if (x.mode === 'A-double-prime') {
          considered.S4 += 1;
          const limit = x.variant === 'link-confirmation-plus-offer' ? 3 : 2;
          if (x.strip.textLines > limit)
            rules.S4.push({
              name,
              why: `${x.strip.textLines} lines (limit ${limit})`,
              size: x.strip.textLines - limit,
            });
        }
        considered.S6 += 1;
        const six = s6(x);
        if (six === null) notes.push(`${name}: no facts or toggle reading for S6`);
        else if (six.off)
          rules.S6.push({
            name,
            why: `toggle centre ${six.gap} px from the facts' (strip bottom ${x.strip.bottom}, toggle top ${x.toggle.top})`,
            size: Math.abs(six.gap),
          });
      } else {
        considered.S5 += 1;
        const toggleOk = Boolean(base.toggle?.selfHitAfterScroll);
        const missed = (x.stripButtons ?? [])
          .filter((b) => !b.selfHitAfterScroll)
          .map((b) => b.text);
        if (missed.length > 0 && toggleOk)
          rules.S5.push({
            name,
            why: `not self-hit after scroll (base toggle is): ${missed.join(', ')}`,
            size: 1,
          });
        if (sideways(x) && !sideways(base))
          rules.S5.push({ name, why: 'adds sideways scroll the base lacks', size: 1 });
        if (x.selection === 'none' && x.stageH < 120 && base.stageH >= 120)
          rules.S5.push({
            name,
            why: `stage ${x.stageH} (base ${base.stageH})`,
            size: 120 - x.stageH,
          });
      }
    }
  }
}

const verdictOf = (rule) => {
  const hits = rules[rule];
  return hits.length === 0 ? 'HOLDS' : `FIRES (${hits.length} readings)`;
};
for (const rule of Object.keys(rules)) {
  console.log(`\n${rule}: ${verdictOf(rule)}  [${considered[rule]} readings judged]`);
  const worst = [...rules[rule]].sort((a, b) => b.size - a.size);
  for (const h of worst.slice(0, 12)) console.log(`  ${h.name}: ${h.why}`);
}
if (!redOk) console.log('\nS6 was not shown red first: its verdict above does not count.');
for (const n of notes.slice(0, 20)) console.log(`NOTE ${n}`);

// ── Ranges behind each verdict, per pointer (what "holds" means in numbers). ──
console.log('\nRANGES BEHIND THE VERDICTS');
for (const pointer of ['fine', 'coarse']) {
  const data = load(`follow-logic-m0d-offer-row.${pointer}.json`);
  if (!data) continue;
  const rs = data.readings;
  const idx = new Map();
  for (const x of rs) {
    const mode = x.mode === 'own-row' ? `own-row/${x.message}` : x.mode;
    idx.set(`${keyOf(x)}|${mode}|${x.variant ?? 'base'}`, x);
  }
  const subjects100 = rs.filter((x) => subject(x) && x.strip && !is200(x));
  const extras = subjects100.map((x) => ({
    x,
    e: s2(x, idx.get(`${keyOf(x)}|base-grouped|base`)),
  }));
  const lo = extras.reduce((a, b) => (b.e.extra < a.e.extra ? b : a));
  const hi = extras.reduce((a, b) => (b.e.extra > a.e.extra ? b : a));
  console.log(
    `  ${pointer} S2: extra from ${lo.e.extra} (${label(pointer, lo.x)}) to ${hi.e.extra} (${label(pointer, hi.x)}) over ${extras.length} readings; ${extras.filter((q) => q.e.extra > 0 && q.e.extra <= 4).length} between 0 and 4; ${extras.filter((q) => q.e.extra === 0).length} at 0; ${extras.filter((q) => q.e.extra < 0).length} below 0`,
  );
  const buttons = subjects100.flatMap((x) => x.stripButtons ?? []);
  console.log(
    `  ${pointer} S1: ${buttons.length} strip buttons, ${buttons.filter((b) => b.selfHitAfterScroll).length} self-hit after scroll, ${buttons.filter((b) => b.selfHitInPlace).length} in place; strip readings with a sideways scroll ${subjects100.filter((x) => sideways(x)).length}; toggles self-hit after scroll ${subjects100.filter((x) => x.toggle?.selfHitAfterScroll).length} of ${subjects100.length}`,
  );
  const none = subjects100.filter((x) => x.selection === 'none');
  const minStage = none.reduce((a, b) => (b.stageH < a.stageH ? b : a));
  console.log(
    `  ${pointer} S3: minimum stage with nothing selected ${minStage.stageH} (${label(pointer, minStage)}; its base ${idx.get(`${keyOf(minStage)}|base|base`)?.stageH}) over ${none.length} readings`,
  );
  const lines = {};
  for (const x of subjects100.filter((y) => y.mode === 'A-double-prime'))
    lines[x.variant] = Math.max(lines[x.variant] ?? 0, x.strip.textLines);
  console.log(`  ${pointer} S4: maximum text lines by variant ${JSON.stringify(lines)}`);
  const six = subjects100.map((x) => ({ x, s: s6(x) })).filter((q) => q.s);
  const maxGap = six.reduce((a, b) => (Math.abs(b.s.gap) > Math.abs(a.s.gap) ? b : a));
  console.log(
    `  ${pointer} S6: largest toggle-to-facts centre offset ${maxGap.s.gap} px (${label(pointer, maxGap.x)}) over ${six.length} readings; base-grouped readings with the toggle off the facts' line ${rs.filter((x) => x.mode === 'base-grouped' && !is200(x) && s6(x)?.off).length}`,
  );
  const bgs = rs.filter((x) => x.mode === 'base-grouped');
  const deltas = bgs.map((x) => ({ x, d: x.footH - idx.get(`${keyOf(x)}|base|base`).footH }));
  const taller = deltas.reduce((a, b) => (b.d > a.d ? b : a));
  const shorter = deltas.reduce((a, b) => (b.d < a.d ? b : a));
  console.log(
    `  ${pointer} S7: base-grouped foot against base, largest increase ${round(taller.d)} (${label(pointer, taller.x)}), largest saving ${round(shorter.d)} (${label(pointer, shorter.x)}); ${deltas.filter((q) => q.d < -0.5).length} cells shorter, ${deltas.filter((q) => Math.abs(q.d) <= 0.5).length} equal, of ${deltas.length}`,
  );
  const s200 = rs.filter((x) => subject(x) && x.strip && is200(x));
  const buttons200 = s200.flatMap((x) => x.stripButtons ?? []);
  console.log(
    `  ${pointer} S5: ${s200.length} readings at 200 %, ${buttons200.filter((b) => b.selfHitAfterScroll).length} of ${buttons200.length} buttons self-hit after scroll, sideways scroll in ${s200.filter((x) => sideways(x)).length}; minimum stage with nothing selected ${Math.min(...s200.filter((x) => x.selection === 'none').map((x) => x.stageH))}`,
  );
}

// ── Sanity: the instrument did what it says. ──
console.log('\nINSTRUMENT CHECKS');
for (const [pointer, data] of Object.entries(all)) {
  const rs = data.readings;
  const expectGroup = (x) =>
    x.mode === 'base-grouped' || x.mode === 'A-double-prime' || x.mode === 'own-row';
  const wrongGroup = rs.filter((x) => Boolean(x.grouped) !== expectGroup(x));
  const noBar = rs.filter((x) => x.selection !== 'none' && !x.selectionBar);
  const barWhenNone = rs.filter((x) => x.selection === 'none' && x.selectionBar);
  const unknownView = rs.filter((x) => x.view !== 'diagram' && x.view !== 'gantt');
  const heldWrong = rs.filter((x) => x.set === 'held' && x.facts?.state !== 'recalculating');
  const r3Wrong = rs.filter((x) => x.set === 'r3s' && x.facts?.state !== 'stale');
  const coarseWrong = rs.filter((x) => x.coarse !== (pointer === 'coarse'));
  const missingStrip = rs.filter((x) => subject(x) && !x.strip);
  console.log(
    `  ${pointer}: ${rs.length} readings; group flag wrong ${wrongGroup.length}; selected cell without a selection bar ${noBar.length}; bar with nothing selected ${barWhenNone.length}; unknown view ${unknownView.length}; held cell not 'recalculating' ${heldWrong.length}; r3s cell not 'stale' ${r3Wrong.length}; pointer type wrong ${coarseWrong.length}; strip mode without a strip ${missingStrip.length}`,
  );
  for (const x of noBar.slice(0, 3)) console.log(`    no bar: ${label(pointer, x)}`);
  for (const x of heldWrong.slice(0, 3))
    console.log(`    held but ${x.facts?.state}: ${label(pointer, x)}`);
  for (const x of r3Wrong.slice(0, 3))
    console.log(`    r3s but ${x.facts?.state}: ${label(pointer, x)}`);
}

// ── Reported, not judged. ──
for (const [pointer, data] of Object.entries(all)) {
  const rs = data.readings;
  const index = new Map();
  for (const x of rs)
    index.set(
      `${keyOf(x)}|${x.mode === 'own-row' ? `own-row/${x.message}` : x.mode}|${x.variant ?? 'base'}`,
      x,
    );
  const get = (set, view, cell, selection, mode, variant, fv = '') =>
    index.get(`${[set, view, cell, selection, fv].join(' | ')}|${mode}|${variant}`);

  console.log(
    `\nS2 BAND (${pointer}): extra px per window width, edit-one, against base-grouped (S2's own formula)`,
  );
  for (const view of ['diagram', 'gantt']) {
    for (const selection of ['placed-unflagged-selected', 'flagged-bar-selected']) {
      const cells = [
        ...new Set(rs.filter((x) => x.set === 'sweep' && x.view === view).map((x) => x.cell)),
      ];
      const row = cells.map((cell) => {
        const x = get('sweep', view, cell, selection, 'A-double-prime', 'edit-one');
        const bg = get('sweep', view, cell, selection, 'base-grouped', 'base');
        if (!x?.strip || !bg) return `${cell.replace('x800', '')}:?`;
        return `${cell.replace('x800', '')}:${s2(x, bg).extra}`;
      });
      console.log(`  ${view} ${selection}: ${row.join(' ')}`);
    }
  }
  console.log(
    `S2 BAND (${pointer}): the toggle's centre offset from the facts', edit-one (0 = same line)`,
  );
  for (const view of ['diagram', 'gantt']) {
    for (const selection of ['placed-unflagged-selected', 'flagged-bar-selected']) {
      const cells = [
        ...new Set(rs.filter((x) => x.set === 'sweep' && x.view === view).map((x) => x.cell)),
      ];
      const row = cells.map((cell) => {
        const x = get('sweep', view, cell, selection, 'A-double-prime', 'edit-one');
        const six = x ? s6(x) : null;
        return `${cell.replace('x800', '')}:${six ? six.gap : '?'}`;
      });
      console.log(`  ${view} ${selection}: ${row.join(' ')}`);
    }
  }

  console.log(
    `\nWHERE THE FACTS SIT (${pointer}): cells where base-grouped moved the facts off the leading edge (base 0)`,
  );
  const moved = [];
  for (const x of rs.filter((y) => y.mode === 'base-grouped')) {
    const b = index.get(`${keyOf(x)}|base|base`);
    if (b?.facts && x.facts && Math.abs(b.facts.leftOffset) < 1 && x.facts.leftOffset >= 1)
      moved.push(x);
  }
  const total = rs.filter((y) => y.mode === 'base-grouped').length;
  console.log(
    `  ${moved.length} of ${total} base-grouped readings (e.g. ${moved
      .slice(0, 3)
      .map((x) => `${x.view} ${x.cell} ${x.selection}`)
      .join('; ')})`,
  );

  console.log(
    `SHIPPED DOCK, the toggle off the facts' line (mode base, no group, no strip) (${pointer})`,
  );
  const stranded = rs.filter((x) => x.mode === 'base' && s6(x)?.off);
  console.log(
    `  ${stranded.length} of ${rs.filter((x) => x.mode === 'base').length} base readings`,
  );
  for (const x of stranded.slice(0, 40))
    console.log(
      `    ${x.set} ${x.view} ${x.cell} ${x.selection} ${x.factsVariant ?? ''} facts ${x.facts?.state} ${x.facts?.w} foot ${x.footH} outlet ${x.outletW} toggle top ${x.toggle?.top} facts top ${x.facts?.itemTop}`,
    );
  console.log(
    `  the same cells with the group only (base-grouped): toggle off the facts' line in ${rs.filter((x) => x.mode === 'base-grouped' && s6(x)?.off).length}`,
  );
  console.log(`  and what the stranded base cells cost against base-grouped (foot row, px):`);
  for (const x of stranded.slice(0, 40)) {
    const bg = index.get(`${keyOf(x)}|base-grouped|base`);
    if (bg)
      console.log(
        `    ${x.set} ${x.cell} ${x.selection} ${x.factsVariant ?? ''}: base ${x.footH}, base-grouped ${bg.footH} (${round(x.footH - bg.footH)})`,
      );
  }

  console.log(
    `\nR3s / HELD (${pointer}): the shipped dock against base-grouped, a bar selected, by facts state`,
  );
  for (const set of ['r3s', 'held']) {
    for (const x of rs.filter(
      (y) => y.set === set && y.mode === 'base' && y.selection !== 'none',
    )) {
      const bg = index.get(`${keyOf(x)}|base-grouped|base`);
      const six = s6(x);
      console.log(
        `  ${set} ${x.cell} ${x.selection.slice(0, 7)} ${x.factsVariant} facts ${x.facts?.w}: base foot ${x.footH} toggle off ${six?.off}; grouped foot ${bg?.footH} toggle off ${bg ? s6(bg)?.off : '?'}`,
      );
    }
  }

  console.log(`\n200 % (${pointer}): line counts and strip heights, reported`);
  for (const set of ['text200-root', 'text200-browser', 'text200-gantt']) {
    for (const x of rs.filter((y) => y.set === set && y.mode === 'A-double-prime')) {
      const b = index.get(`${keyOf(x)}|base|base`);
      console.log(
        `  ${set} ${x.selection.slice(0, 7)} ${x.variant}: lines ${x.strip?.textLines} strip ${x.strip?.h} stage ${x.stageH} (base ${b?.stageH}) hits ${(x.stripButtons ?? []).map((q) => (q.selfHitAfterScroll ? 1 : 0)).join('')} toggle after scroll ${x.toggle?.selfHitAfterScroll} sideways ${sideways(x)}`,
      );
    }
  }

  console.log(
    `\nROW 580 (${pointer}): foot growth against the cell's base (shipped) and base-grouped (own-row); S2 and S6 on own-row`,
  );
  for (const cell of [
    '1024x600',
    '1210x800',
    '1220x800',
    '1230x800',
    '1240x800',
    '1250x800',
    '1280x800',
  ]) {
    for (const selection of ['none', 'flagged-bar-selected', 'plural']) {
      const messages =
        selection === 'plural' ? ['bulk-bar'] : ['bare-linked', 'undo-result', 'layout-resolved'];
      for (const message of messages) {
        const base = index.get(`messages | diagram | ${cell} | ${selection} | |base|base`);
        const bg = index.get(`messages | diagram | ${cell} | ${selection} | |base-grouped|base`);
        const sh = rs.find(
          (y) =>
            y.set === 'messages' &&
            y.cell === cell &&
            y.selection === selection &&
            y.message === message &&
            y.mode === 'shipped',
        );
        const own = rs.find(
          (y) =>
            y.set === 'messages' &&
            y.cell === cell &&
            y.selection === selection &&
            y.message === message &&
            y.mode === 'own-row',
        );
        if (!base || !bg || !sh?.strip || !own?.strip) continue;
        const e = s2(own, bg);
        const six = s6(own);
        const hits = (own.stripButtons ?? []).map((q) => (q.selfHitAfterScroll ? 1 : 0)).join('');
        console.log(
          `  ${cell} ${selection.slice(0, 7).padEnd(7)} ${message.padEnd(13)} shipped +${round(sh.footH - base.footH)} cut ${sh.strip.textTruncated} | own-row +${round(own.footH - bg.footH)} (vs base ${round(own.footH - base.footH)}) lines ${own.strip.textLines} cut ${own.strip.textTruncated} strip ${own.strip.h} stage ${own.stageH} (base ${base.stageH}) hits ${hits} extra ${e.extra} toggle off ${six?.off}`,
        );
      }
    }
  }
}
