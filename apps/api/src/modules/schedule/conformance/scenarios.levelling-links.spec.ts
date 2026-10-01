import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { runScenario } from './scenarios';

/**
 * **S10 gains its first evidence that levelling follows the links** (`docs/specs/logic-aware-levelling/`
 * spec §4.5, C11), in a file of its own so that `scenarios.spec.ts`'s S10 assertions stay exactly as they
 * are: those say the two serialised pairs serialise and the mandatory activities do not move, and they
 * pass before and after this epic unedited.
 *
 * What the fixture does (`m0-measurement.md`, M0-T1): the crane pair that levelling serialises is
 * `A6100` and `A6200`, and the one it DELAYS is `A6100` (4,800 minutes), not `A6200` as the spec's C11
 * assumed. `A6100 → A6200` is SS+0, so `A6200` must start no earlier than `A6100`'s ghost does, and the
 * chain behind them (`A6500`, and through the rest of the network `A7740`) must follow. Before Pass C
 * none of them had an overlay at all; those cases were `it.fails` in M0 and are plain `it` now. The last
 * two held both before and after: they say a follower is never left before the predecessor it follows.
 */
describe('S10: what follows the delayed crane activity follows it', () => {
  const run = runScenario(loadFixture(), 'S10_LEVELLED');
  if (!run.ran) throw new Error('S10 is expected to run');
  const byId = new Map(run.output.results.map((r) => [r.activityId, r]));

  /** Where a bar's ghost starts: its overlay where it has one, else where it is drawn. */
  const startOf = (id: string) =>
    byId.get(id)!.leveledStartOffset ?? byId.get(id)!.placedStartOffset;
  const finishOf = (id: string) =>
    byId.get(id)!.leveledFinishOffset ?? byId.get(id)!.placedFinishOffset;

  it('precondition: A6100 is delayed, and A6200 is DRAWN before A6100 starts', () => {
    expect(byId.get('A6100')!.levelingDelay ?? 0).toBeGreaterThan(0);
    // Read from where the bar is drawn, not from its overlay, so the case is about the fixture.
    expect(byId.get('A6200')!.placedStartOffset).toBeLessThan(startOf('A6100'));
  });

  it('A6200 starts no earlier than A6100 does (SS+0)', () => {
    expect(startOf('A6200')).toBeGreaterThanOrEqual(startOf('A6100'));
  });

  it('A6500 and A7740 have a levelled position of their own', () => {
    expect(byId.get('A6500')!.leveledStartOffset ?? null).not.toBeNull();
    expect(byId.get('A7740')!.leveledStartOffset ?? null).not.toBeNull();
  });

  it('A6500 starts no earlier than A6200 finishes (FS+0)', () => {
    expect(startOf('A6500')).toBeGreaterThanOrEqual(finishOf('A6200'));
  });

  it('A7740 starts no earlier than A7730 finishes (FS+0)', () => {
    expect(startOf('A7740')).toBeGreaterThanOrEqual(finishOf('A7730'));
  });
});
