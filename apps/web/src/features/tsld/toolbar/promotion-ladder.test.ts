import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LADDER_ROW, PROMOTION_LADDER, type LadderRank } from './promotion-ladder';
import { ALL_PROMOTION_ENTRIES } from './tsld-toolbar-items';

import {
  computePromotionStages,
  PROMOTION_STAGE_NAMES,
  type PromotionPointer,
  type PromotionWidths,
} from '@/components/ui/toolbar/toolbar-promotion';

/**
 * **SC-18 (c): every committed `at` is what `computePromotionStages` says it is** (toolbar-redesign
 * M5, spec §4.11 "Checks").
 *
 * The thresholds in `promotion-ladder.ts` are constants, not a mechanism, so the only thing that
 * keeps them honest is this test re-deriving them from the committed widths. Raise one by hand and
 * it goes red — **verified red** by changing `P4`'s fine stage from `PROMOTE_80` to `PROMOTE_90`
 * (ADR-0110), which names the rank, the pointer, and what the computation says instead.
 *
 * The widths themselves are held true by `e2e-workspace-fit/promotion.spec.ts` (SC-18 a), which
 * measures every promoted form at 3840 × 1440 and fails when one drifts by more than 2 px — so the
 * chain is: the real deck → the JSON → the stages → the constants, and each link has a check.
 */
const SPEC_DIR = resolve(import.meta.dirname, '../../../../../../docs/specs/toolbar-redesign');

function widthsFor(pointer: PromotionPointer): PromotionWidths {
  return JSON.parse(
    readFileSync(resolve(SPEC_DIR, `promotion-widths.${pointer}.json`), 'utf8'),
  ) as PromotionWidths;
}

const POINTERS: readonly PromotionPointer[] = ['fine', 'coarse'];
const RANKS = Object.keys(PROMOTION_LADDER) as LadderRank[];

describe.each(POINTERS)('the promotion ladder, %s pointer', (pointer) => {
  const widths = widthsFor(pointer);

  it('is the committed widths, run through computePromotionStages', () => {
    const computed = computePromotionStages(widths);
    const committed = Object.fromEntries(
      RANKS.map((rank) => [rank, PROMOTION_LADDER[rank][pointer]]),
    );
    expect(committed).toEqual(computed);
  });

  it('has a width for exactly the ranks the ladder declares, on the row the ladder declares', () => {
    expect(widths.entries.map((e) => e.rank).sort()).toEqual([...RANKS].sort());
    for (const entry of widths.entries) {
      expect(entry.row, entry.rank).toBe(LADDER_ROW[entry.rank as LadderRank]);
    }
    expect([...widths.ladderOrder.look, ...widths.ladderOrder.do].sort()).toEqual(
      [...RANKS].sort(),
    );
  });

  it('excludes the canvas row: the cluster is staged on stage width, not on the deck', () => {
    expect(Object.keys(widths.freeWidthByStage).sort()).toEqual(['do', 'look']);
    expect(new Set(widths.entries.map((e) => e.row))).toEqual(new Set(['look', 'do']));
  });

  it('is committed as measured, not as projected', () => {
    expect((widths as unknown as { provisional: boolean }).provisional).toBe(false);
  });

  it('leaves every row ≤ 15 % empty in the base state, or has nothing left that fits (SC-17)', () => {
    const computed = computePromotionStages(widths);
    for (const row of ['look', 'do'] as const) {
      for (const stage of PROMOTION_STAGE_NAMES) {
        const free = widths.freeWidthByStage[row][stage] as unknown as {
          avail: number;
          freeBase: number;
          freeWorst: number;
        };
        const stageIndex = PROMOTION_STAGE_NAMES.indexOf(stage);
        const onBar = widths.entries.filter(
          (e) =>
            e.row === row &&
            computed[e.rank] !== 'never' &&
            PROMOTION_STAGE_NAMES.indexOf(
              computed[e.rank] as (typeof PROMOTION_STAGE_NAMES)[number],
            ) <= stageIndex,
        );
        const used = onBar.reduce((sum, e) => sum + e.width + widths.itemGapPx, 0);
        const safety = widths.safetyPx ?? 0;
        const unusedBase = free.freeBase - used;
        const unusedWorst = free.freeWorst - used;
        const cell = `${row} ${stage}`;
        // No promoted entry may wrap the row, even with the worst stress state present. Where the
        // worst state already wraps an unpromoted row (coarse LOOK at 80 rem with a conflict read-out:
        // `m4-measurement.md` §2, accepted for touch), nothing may be promoted into it at all.
        if (free.freeWorst < 0) expect(used, `${cell}: promoted into a row that wraps`).toBe(0);
        else
          expect(unusedWorst, `${cell}: the worst state wraps the row`).toBeGreaterThanOrEqual(0);
        const waiting = widths.entries.filter(
          (e) =>
            e.row === row &&
            !onBar.includes(e) &&
            e.width + widths.itemGapPx + safety <= unusedWorst,
        );
        const pct = (unusedBase / free.avail) * 100;
        expect(
          pct <= 15 || waiting.length === 0,
          `${cell}: ${pct.toFixed(1)} % empty with ${waiting.map((w) => w.rank).join(', ')} still fitting`,
        ).toBe(true);
      }
    }
  });
});

describe('the ladder and the entries', () => {
  it('every entry reads its stage from the ladder, and every rank backs at least one entry', () => {
    for (const entry of ALL_PROMOTION_ENTRIES) {
      expect(
        Object.values(PROMOTION_LADDER).includes(entry.at as (typeof PROMOTION_LADDER)[LadderRank]),
        `${entry.id} declares an at that is not a ladder rank`,
      ).toBe(true);
    }
    for (const rank of RANKS) {
      const backing = ALL_PROMOTION_ENTRIES.filter((e) => e.at === PROMOTION_LADDER[rank]);
      expect(backing.length, `rank ${rank} backs no entry`).toBeGreaterThan(0);
    }
  });

  it('the two flat pressed sets move together: all of a set is on the bar or none of it is', () => {
    const rankOf = (id: string): LadderRank | undefined =>
      RANKS.find(
        (rank) => ALL_PROMOTION_ENTRIES.find((e) => e.id === id)?.at === PROMOTION_LADDER[rank],
      );
    expect(
      new Set(['colour-by-criticality', 'colour-by-totalFloat', 'colour-by-wbs'].map(rankOf)),
    ).toEqual(new Set(['L2']));
    expect(new Set(['link-fs', 'link-ss', 'link-ff'].map(rankOf))).toEqual(new Set(['P5']));
  });
});
