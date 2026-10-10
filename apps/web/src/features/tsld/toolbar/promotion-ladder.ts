import type { PromotionAt } from '@/components/ui/toolbar/toolbar-promotion';

/**
 * **The promotion ladder's thresholds — committed constants, not a mechanism** (toolbar-redesign M5,
 * spec §4.11). Each rank is a menu command that comes out onto the bar when the viewport reaches the
 * stage named for the pointer in use; `'never'` means the ladder is exhausted for the room left, so
 * the command stays in its menu at every width.
 *
 * **These were computed, and a test keeps them so.** `promotion-ladder.test.ts` runs
 * `computePromotionStages` over `docs/specs/toolbar-redesign/promotion-widths.<pointer>.json` and
 * fails when any entry here differs: raise a threshold by hand and SC-18 (c) goes red (verified red,
 * ADR-0110). The widths in those files are themselves held true by the SC-18 (a) journey, which
 * measures every promoted form at 3840 × 1440 and fails when one drifts by more than 2 px.
 * Re-derive by re-taking the widths (`measure-toolbar/toolbar-redesign-m5.spec.ts`), never by editing
 * a stage to make a row look fuller.
 *
 * The ranks are the analyst's ranking by frequency, importance and glyph test (decision D-n), in the
 * order the spec's §4.11 table lists them. `L` ranks live on the LOOK deck row, `P` ranks on DO.
 * Legend, Resource view, Baseline overlay and the Minimap are `'always'` records on their own
 * `LensToggle`s and are deliberately absent: the ladder never promotes or demotes them.
 */
export type LadderRank =
  'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';

export const PROMOTION_LADDER: Readonly<Record<LadderRank, Exclude<PromotionAt, 'always'>>> = {
  // LOOK
  L1: { fine: 'never', coarse: 'never' },
  L2: { fine: 'never', coarse: 'never' },
  L3: { fine: 'never', coarse: 'never' },
  L4: { fine: 'never', coarse: 'never' },
  L5: { fine: 'never', coarse: 'never' },
  L6: { fine: 'never', coarse: 'never' },
  // DO
  P1: { fine: 'never', coarse: 'never' },
  P2: { fine: 'never', coarse: 'never' },
  P3: { fine: 'never', coarse: 'never' },
  P4: { fine: 'never', coarse: 'never' },
  P5: { fine: 'never', coarse: 'never' },
  P6: { fine: 'never', coarse: 'never' },
  P7: { fine: 'never', coarse: 'never' },
  P8: { fine: 'never', coarse: 'never' },
};

/** Which deck row each rank belongs to — the first letter, stated once for the unit test. */
export const LADDER_ROW: Readonly<Record<LadderRank, 'look' | 'do'>> = {
  L1: 'look',
  L2: 'look',
  L3: 'look',
  L4: 'look',
  L5: 'look',
  L6: 'look',
  P1: 'do',
  P2: 'do',
  P3: 'do',
  P4: 'do',
  P5: 'do',
  P6: 'do',
  P7: 'do',
  P8: 'do',
};
