// @ts-check
/**
 * Fixtures for `measure-loading-shapes.judge.mjs` — every case names the mutation that makes it red
 * (ADR-0110 D5: a gate is finished when it has been made to fail by the defect it was written for).
 *
 * Run standalone: `node scripts/measure-loading-shapes.judge.test.mjs`
 */
import assert from 'node:assert/strict';

import {
  assertExamined,
  judgeAnchors,
  judgeColumns,
  judgeSentences,
  NothingSettledError,
} from './measure-loading-shapes.judge.mjs';

const it = (what, fn) => {
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  x ${what}\n    ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
};

const anchor = (key, top, left = 0) => ({ key, top, left, width: 100 });
const snap = (anchors, skeletons = 3, settledCells = 3) => ({ anchors, skeletons, settledCells });

// Mutation: change `<=` to `<` in the tolerance test and the exact-1px case turns red.
it('an anchor that moved exactly 1 px passes SC-2', () => {
  const r = judgeAnchors(snap([anchor('h2 Projects', 100)]), snap([anchor('h2 Projects', 101)], 0));
  assert.equal(r.verdict, 'PASS');
});

// Mutation: raise ANCHOR_TOLERANCE_PX to 2.
it('an anchor that moved 2 px fails SC-2', () => {
  const r = judgeAnchors(snap([anchor('h2 Projects', 100)]), snap([anchor('h2 Projects', 102)], 0));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.failing[0]?.dy, 2);
});

// Mutation: skip the sideways axis (compare dy only).
it('a sideways shift fails SC-2 as well as a vertical one', () => {
  const r = judgeAnchors(snap([anchor('th Name', 50, 10)]), snap([anchor('th Name', 50, 120)], 0));
  assert.equal(r.verdict, 'FAIL');
});

// Mutation: drop the absentWhilePending branch (an unmatched settled anchor would read as a pass).
it('an anchor that exists only once settled is a failure, not a pass', () => {
  const r = judgeAnchors(snap([]), snap([anchor('h2 Plans', 400)], 0));
  assert.equal(r.verdict, 'FAIL');
  assert.deepEqual(r.absentWhilePending, ['h2 Plans']);
});

// Mutation: grade every column instead of only `fit` (the auto column below would fail).
it('only fit columns are graded; auto columns are reported', () => {
  const r = judgeColumns([
    { header: 'Working days', mode: 'fit', pending: 186, settled: 190 },
    { header: 'Name', mode: 'auto', pending: 628, settled: 738 },
  ]);
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.columns[1]?.verdict, 'REPORTED');
});

// Mutation: change the 8 px bound to 16 and #341's measured 16 -> 190 px baseline would pass.
it("#341's baseline (a fit column 16 px against 190 px) fails SC-3", () => {
  const r = judgeColumns([{ header: 'Working days', mode: 'fit', pending: 16, settled: 190 }]);
  assert.equal(r.verdict, 'FAIL');
});

// Mutation: return 'PASS' when nothing was graded.
it('a table with no fit column grades nothing rather than passing', () => {
  const r = judgeColumns([{ header: 'Name', mode: 'auto', pending: 10, settled: 90 }]);
  assert.equal(r.verdict, 'NOTHING_GRADED');
});

// Mutation: delete the first guard in assertExamined.
it('refuses a verdict when the settled snapshot still holds a skeleton', () => {
  assert.throws(
    () => assertExamined('clients', snap([anchor('h1', 0)]), snap([anchor('h1', 0)], 2)),
    NothingSettledError,
  );
});

// Mutation: delete the empty-anchors guard.
it('refuses a verdict when the settled snapshot has no anchors', () => {
  assert.throws(() => assertExamined('clients', snap([]), snap([], 0)), NothingSettledError);
});

// Mutation: make requireSkeleton always on (the baseline run, which finds spinners, would throw).
it('a spinner-pending baseline is allowed unless a skeleton is required', () => {
  const pending = snap([anchor('h1', 0)], 0);
  const settled = snap([anchor('h1', 0)], 0);
  assertExamined('client-detail', pending, settled);
  assert.throws(
    () => assertExamined('client-detail', pending, settled, { requireSkeleton: true }),
    NothingSettledError,
  );
});

// Mutation: ignore insideBusy.
it('a sentence inside an aria-busy subtree fails SC-4 even when the count is right', () => {
  const r = judgeSentences([{ kind: 'role=status', text: 'Loading…', insideBusy: true }], 1);
  assert.equal(r.verdict, 'FAIL');
});

// Mutation: compare count with `>=`.
it('two sentences where one is expected fails SC-4', () => {
  const region = { kind: 'role=status', text: 'Loading…', insideBusy: false };
  assert.equal(judgeSentences([region, region], 1).verdict, 'FAIL');
});

it('one sentence outside any busy subtree passes SC-4', () => {
  const r = judgeSentences([{ kind: 'role=status', text: 'Loading…', insideBusy: false }], 1);
  assert.equal(r.verdict, 'PASS');
});
// Mutation: count regions that had unmounted before the reading.
it('a region unmounted before the reading was not speaking and is not counted', () => {
  const r = judgeSentences(
    [
      { kind: 'role=status', text: 'Loading…', insideBusy: false, connected: false },
      { kind: 'role=status', text: 'Loading clients…', insideBusy: false, connected: true },
    ],
    1,
  );
  assert.equal(r.verdict, 'PASS');
  assert.deepEqual(r.unmounted, ['Loading…']);
});

// Mutation: drop the connected check entirely, or apply it to the busy test only.
it('two regions mounted together still fail SC-4', () => {
  const region = { kind: 'role=status', text: 'Loading…', insideBusy: false, connected: true };
  assert.equal(judgeSentences([region, region], 1).verdict, 'FAIL');
});

// Mutation: treat every announcer sentence as shell, hiding a loading sentence spoken there.
it('the shell announcer is set aside for a result sentence and not for a loading one', () => {
  const announcer = {
    kind: 'role=status',
    insideBusy: false,
    connected: true,
    path: 'div > div[data-testid=announcer]',
  };
  const surface = {
    kind: 'role=status',
    text: 'Loading plans…',
    insideBusy: false,
    connected: true,
  };
  assert.equal(
    judgeSentences([surface, { ...announcer, text: '1 project loaded.' }], 1).verdict,
    'PASS',
  );
  assert.equal(
    judgeSentences([surface, { ...announcer, text: 'Loading calendars…' }], 1).verdict,
    'FAIL',
  );
});
