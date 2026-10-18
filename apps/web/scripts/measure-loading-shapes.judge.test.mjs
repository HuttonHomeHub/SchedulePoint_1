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

// The 2026-10-18 amendment to SC-2 (product owner). Each case names the mutation that turns it red.
const th = (key, left, mode, extra = {}) => ({
  ...anchor(key, 50, left),
  mode,
  table: 0,
  afterTable: -1,
  ...extra,
});
const tbl = (rows, bodyHeight) => ({ rows, bodyHeight });
const withTables = (anchors, tables, skeletons = 3) => ({ ...snap(anchors, skeletons), tables });

// Mutation: grade the x of every column heading again (ignore `mode`).
it('a heading on an auto column that slid sideways is reported, not failed', () => {
  const r = judgeAnchors(
    snap([th('th Name', 10, 'auto'), anchor('h2 Projects', 20)]),
    snap([th('th Name', 360, 'auto'), anchor('h2 Projects', 20)], 0),
  );
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.reported[0]?.class, 'reportedX');
});

// Mutation: skip the vertical test for a reported column.
it('an auto column heading that moved DOWN still fails', () => {
  const pendingTh = th('th Name', 10, 'auto');
  const r = judgeAnchors(snap([pendingTh]), snap([{ ...pendingTh, top: 80 }], 0));
  assert.equal(r.verdict, 'FAIL');
});

// Mutation: exempt fit columns from the sideways test as well.
it('a fit heading that moved on its own account still fails', () => {
  const r = judgeAnchors(
    snap([th('th Created', 300, 'fit')]),
    snap([th('th Created', 120, 'fit')], 0),
  );
  assert.equal(r.verdict, 'FAIL');
});

// Mutation: report a fit heading's x without checking the arithmetic of the columns to its left.
it('a fit heading is reported only when the columns to its left account for the move', () => {
  const columns = {
    pending: [
      { mode: 'auto', width: 628 },
      { mode: 'fit', width: 140 },
    ],
    settled: [
      { mode: 'auto', width: 278 },
      { mode: 'fit', width: 140 },
    ],
  };
  const pending = snap([th('th Created', 638, 'fit', { col: 1 }), anchor('h2 A', 5)]);
  const explained = snap([th('th Created', 288, 'fit', { col: 1 }), anchor('h2 A', 5)], 0);
  const unexplained = snap([th('th Created', 200, 'fit', { col: 1 }), anchor('h2 A', 5)], 0);
  assert.equal(judgeAnchors(pending, explained, { columns }).verdict, 'PASS');
  assert.equal(judgeAnchors(pending, explained, { columns }).reported[0]?.class, 'followsUpstream');
  assert.equal(judgeAnchors(pending, unexplained, { columns }).verdict, 'FAIL');
});

// Mutation: always call a shift below a table row growth.
it('a heading under a table that shifted by exactly the rows arriving is growth below', () => {
  // Three 40 px placeholder rows (120) settle into five 40 px rows (200): everything below moves 80.
  const pending = withTables([anchor('h2 Calendars', 300)], [tbl(3, 120)]);
  const settled = withTables([{ ...anchor('h2 Calendars', 380), afterTable: 0 }], [tbl(5, 200)], 0);
  const r = judgeAnchors(pending, settled);
  assert.equal(r.failing.length, 0);
  assert.equal(r.reported[0]?.class, 'growthBelow');
});

// Mutation: drop the placeholder-height check (a taller pending block would read as row growth).
it('a shift under a table is NOT growth when the placeholder rows were not row-sized', () => {
  const pending = withTables([anchor('h2 Calendars', 300)], [tbl(3, 200)]);
  const settled = withTables([{ ...anchor('h2 Calendars', 220), afterTable: 0 }], [tbl(5, 120)], 0);
  // The body shrank by 80 and the heading moved -80, but 5 rows of 24 px are not three of 66 px.
  assert.equal(judgeAnchors(pending, settled).verdict, 'FAIL');
});

// Mutation: let a shift below a table pass without comparing it with the body change.
it('a shift under a table that the table does not account for fails', () => {
  const pending = withTables([anchor('h2 Calendars', 300)], [tbl(3, 120)]);
  const settled = withTables([{ ...anchor('h2 Calendars', 450), afterTable: 0 }], [tbl(5, 200)], 0);
  assert.equal(judgeAnchors(pending, settled).verdict, 'FAIL');
});

// Mutation: treat an absent anchor as a pass, or drop the subjectHeading gate.
it('the subject h1 and the actions heading are absent by construction, and listed', () => {
  const r = judgeAnchors(
    snap([anchor('h2 Projects', 20)]),
    snap([anchor('h2 Projects', 20), anchor('h1 Northgate', 0), anchor('th Actions', 50)], 0),
    { subjectHeading: true },
  );
  assert.equal(r.verdict, 'PASS');
  assert.deepEqual(
    r.absentByConstruction.map((a) => a.key),
    ['h1 Northgate', 'th Actions'],
  );
  assert.equal(judgeAnchors(snap([]), snap([anchor('h1 Northgate', 0)], 0)).verdict, 'FAIL');
});

// Mutation: return PASS when every compared anchor was exempt or none existed.
it('a page with nothing comparable grades nothing rather than passing', () => {
  const r = judgeAnchors(snap([]), snap([anchor('h1 Plan', 0)], 0), { subjectHeading: true });
  assert.equal(r.verdict, 'NOTHING_GRADED');
});

// Mutation: send an absent heading above every table to appearsBelow.
it('an absent heading below a table appears below the last placeholder; one above does not', () => {
  const below = judgeAnchors(
    snap([anchor('h2 Plans', 20)]),
    snap([anchor('h2 Plans', 20), { ...anchor('h2 Calendars', 500), afterTable: 0 }], 0),
  );
  assert.equal(below.verdict, 'PASS');
  assert.deepEqual(below.appearsBelow, ['h2 Calendars']);
});
