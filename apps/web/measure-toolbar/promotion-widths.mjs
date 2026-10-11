/**
 * Re-take `docs/specs/toolbar-redesign/promotion-widths.{fine,coarse}.json` from two harness runs
 * (toolbar-redesign M5). Not a gate and not run by CI: the committed JSON is the record, and
 * `promotion-ladder.test.ts` re-derives the ladder from it.
 *
 *   1. `pnpm measure:toolbar -- toolbar-redesign-m5`                    (the promoted deck)
 *   2. `M5_UNPROMOTED=1 pnpm measure:toolbar -- toolbar-redesign-m5`    (the deck before the ladder)
 *   3. `node measure-toolbar/promotion-widths.mjs`
 *
 * What it takes from each: the **promoted** run's 3840 x 1440 reading gives every promoted form's
 * width (the sum of its items' rects plus the 4 px gaps between them); the **unpromoted** run gives,
 * at each stage's cell, the room the row has — `avail` less the row's natural no-wrap width — in the
 * base state and in the worst stress state. What it leaves alone: the ladder order, the safety
 * margin and the item gap, which are decisions rather than readings, and the C1 notes.
 *
 * An entry that also *shrinks its trigger* (Share… turns "Share & export" into "Export") is charged
 * net: the trigger's width in the unpromoted wide reading less its width in the promoted one is
 * subtracted, so the ladder's arithmetic is the row's real arithmetic.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../measure-output');
const SPEC = resolve(HERE, '../../../docs/specs/toolbar-redesign');

/** Stage name -> the cell the harness reads it at. */
const STAGE_CELLS = {
  PROMOTE_80: '1280x800',
  PROMOTE_90: '1440x900',
  PROMOTE_100: '1600x900',
  PROMOTE_119_5: '1912x1080',
  PROMOTE_135: '2160x1200',
  PROMOTE_160: '2560x1440',
};

/** Entries whose promotion also renames their trigger: rank -> the trigger's item id. */
const TRIGGER_RENAMED_BY = { P4: 'export' };

const r1 = (n) => Math.round(n * 10) / 10;
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

for (const pointer of ['fine', 'coarse']) {
  const promoted = read(resolve(OUT, `toolbar-redesign-m5.${pointer}.json`));
  const unpromoted = read(resolve(OUT, `toolbar-redesign-m5-unpromoted.${pointer}.json`));
  const file = resolve(SPEC, `promotion-widths.${pointer}.json`);
  const committed = read(file);
  const gap = committed.itemGapPx;

  const widthOf = (reading, id) => {
    const item = reading.wide.items.find((i) => i.id === id);
    if (!item) throw new Error(`${pointer}: no "${id}" in the 3840 x 1440 reading`);
    return item.w;
  };

  committed.entries = committed.entries.map((entry) => {
    const ids = Object.keys(entry.memberWidths);
    // A form whose stage is 'never' is not on the bar at 3840 either, so there is no rect to read:
    // its committed width stands (read once with the ladder locally set to PROMOTE_80 for every
    // rank — a single button's width does not depend on the rest of the deck).
    const memberWidths = Object.fromEntries(
      ids.map((id) => {
        const item = promoted.wide.items.find((i) => i.id === id);
        if (item === undefined) console.log(`${pointer}: ${entry.rank} ${id} not on the bar; kept`);
        return [id, item === undefined ? entry.memberWidths[id] : item.w];
      }),
    );
    let width = Object.values(memberWidths).reduce((a, b) => a + b, 0) + gap * (ids.length - 1);
    const next = { ...entry, memberWidths };
    delete next.triggerShrinkPx;
    const trigger = TRIGGER_RENAMED_BY[entry.rank];
    if (trigger !== undefined) {
      const shrink = widthOf(unpromoted, trigger) - widthOf(promoted, trigger);
      if (shrink > 0.5) {
        next.triggerShrinkPx = r1(shrink);
        width -= shrink;
      }
    }
    next.width = r1(width);
    return next;
  });

  const cellReading = (reading, state, cell) => {
    const found = reading.cells.find((c) => c.state === state && c.cell === cell);
    if (!found) throw new Error(`${pointer}: no ${state} reading at ${cell}`);
    return found;
  };
  const worstState = 'conflicts-cycling+peer-pen';
  committed.freeWidthByStage = Object.fromEntries(
    ['look', 'do'].map((row) => [
      row,
      Object.fromEntries(
        Object.entries(STAGE_CELLS).map(([stage, cell]) => {
          const base = cellReading(unpromoted, 'base', cell).natural[row];
          const worst = cellReading(unpromoted, worstState, cell).natural[row];
          return [
            stage,
            {
              cell,
              avail: base.available,
              naturalBase: base.natural,
              freeBase: r1(base.available - base.natural),
              worstState: row === 'look' ? worstState : 'peer-pen',
              naturalWorst: worst.natural,
              freeWorst: r1(worst.available - worst.natural),
            },
          ];
        }),
      ),
    ]),
  );
  committed.note =
    'Re-taken by measure-toolbar/promotion-widths.mjs from two runs of measure-toolbar/toolbar-redesign-m5.spec.ts. ' +
    'entries[].width is each promoted form as it renders on the real deck at 3840x1440 (e2e-workspace-fit/promotion.spec.ts holds it true within 2 px): ' +
    'the sum of the item rects of the entry (a set includes its aria-hidden caption) plus the 4 px gaps between them, less triggerShrinkPx where promoting the entry also shortens its trigger (Share... turns "Share & export" into "Export"). ' +
    'A form whose stage is never is not on the bar at 3840, so its committed width stands. ' +
    'freeWidthByStage is the real UNPROMOTED deck at each stage cell (M5_UNPROMOTED=1: the stage media queries answer not-reached): the row width less its natural width in the base state and in the worst stress state, ' +
    'a cycling conflict read-out on LOOK and a peer holding the pen on DO. computePromotionStages reserves freeWorst less safetyPx, the spare width every row keeps in the worst state so a sub-pixel font difference cannot wrap a row the ladder filled to the pixel.';
  delete committed.unusedBeforeToday;
  committed.provisional = false;
  writeFileSync(file, `${JSON.stringify(committed, null, 2)}\n`);
  console.log(`${pointer}: ${file}`);
}
