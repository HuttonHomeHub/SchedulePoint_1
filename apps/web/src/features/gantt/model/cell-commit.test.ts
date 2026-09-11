import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  cellWriteFields,
  commitCell,
  describeCommitFailure,
  type CellWriteContext,
} from './cell-commit';
import { GANTT_EDITABLE_COLUMNS, type GanttCellKey } from './cell-edit';

import { ApiFetchError } from '@/lib/api/client';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * **M2-T3 — what a typed cell sends, and what it does when the server says no.**
 *
 * The mutation is injected, so the three outcomes the grid will really meet (200, 423, 409) are
 * three unit tests rather than three journeys. The journey still exists and still matters — a
 * mocked fetch accepts any `version`, so only a real server can prove the optimistic check is
 * actually armed — but it should not be where a status-code branch is first exercised.
 */

const EIGHT_HOUR = 8;

const activity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  ({
    id: 'a1',
    name: 'Foundations',
    type: 'TASK',
    version: 7,
    durationDays: 5,
    durationMinutes: 2400,
    // A computed span, so the date branches have one end to hold. Mon 2 – Fri 6 March 2026.
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-06',
    visualEffectiveStart: '2026-03-02',
    visualEffectiveFinish: '2026-03-06',
    lateStart: '2026-03-09',
    lateFinish: '2026-03-13',
    constraintType: null,
    ...over,
  }) as unknown as ActivitySummary;

/** The context every non-date key ignores, spelled once. */
const ctx = (over: Partial<CellWriteContext> = {}): CellWriteContext => ({
  activity: activity(),
  hoursPerDay: EIGHT_HOUR,
  schedulingMode: 'EARLY',
  barDateSource: 'early',
  ...over,
});

/** The fields a successful write sends, or `null` for a refusal — the old shape, for brevity. */
const fieldsOf = (result: ReturnType<typeof cellWriteFields>): Record<string, unknown> | null =>
  result.ok ? result.fields : null;

const reasonOf = (result: ReturnType<typeof cellWriteFields>): string | null =>
  result.ok ? null : result.reason;

const apiError = (status: number, message = 'no') =>
  new ApiFetchError(status, { code: 'X', message });

describe('cellWriteFields', () => {
  it('sends a trimmed name, and refuses an empty one', () => {
    expect(fieldsOf(cellWriteFields('name', '  Piling  ', ctx()))).toEqual({ name: 'Piling' });
    // Reachable by pressing Enter on a cleared cell, which is a slip rather than an intention.
    expect(fieldsOf(cellWriteFields('name', '   ', ctx()))).toBeNull();
  });

  it('sends minutes for a sub-day duration when the calendar factor is known', () => {
    expect(fieldsOf(cellWriteFields('duration', '4h', ctx()))).toEqual({ durationMinutes: 240 });
  });

  it('sends whole days when the factor is unavailable — the flag-off path', () => {
    expect(fieldsOf(cellWriteFields('duration', '3', ctx({ hoursPerDay: undefined })))).toEqual({
      durationDays: 3,
    });
  });

  it('refuses a duration the parser would not accept, rather than sending a guess', () => {
    expect(fieldsOf(cellWriteFields('duration', '2 weeks', ctx()))).toBeNull();
  });

  it('accepts a percentage with or without its sign, and refuses one out of range', () => {
    expect(fieldsOf(cellWriteFields('percentComplete', '40', ctx()))).toEqual({
      percentComplete: 40,
    });
    expect(fieldsOf(cellWriteFields('percentComplete', '40%', ctx()))).toEqual({
      percentComplete: 40,
    });
    expect(fieldsOf(cellWriteFields('percentComplete', '140', ctx()))).toBeNull();
    expect(fieldsOf(cellWriteFields('percentComplete', '-1', ctx()))).toBeNull();
    expect(fieldsOf(cellWriteFields('percentComplete', 'soon', ctx()))).toBeNull();
  });

  /**
   * **ADR-0134 — a typed date writes the constraint a drag writes.**
   *
   * Every branch below mirrors `use-plan-workspace-model.ts:1179-1216` rather than inventing a grid
   * semantic, and the arithmetic is the canvas's: `durationDays = finish − newStart + 1`, calendar
   * days, inclusive (`TsldPanel.tsx:165-168`). The fixture's activity runs Mon 2 → Fri 6 March
   * 2026, so a five-day span whose ends are easy to check by eye.
   *
   * The case this replaces asserted that both keys were refused **outright**, and was true of the
   * write while saying nothing about the cell — which is exactly how `docs/TECH_DEBT.md` #290
   * shipped. The relationship test below is the one that can see that, and it is kept.
   */
  describe('a typed date', () => {
    it('pins the start as an SNET in Early mode, holding the finish', () => {
      // D2. The start is computed, so the only honest way to move it is to pin it — and the
      // duration shrinks so the finish stays where the planner can see it.
      // New start Wed 4 March, finish still Fri 6 → 3 calendar days inclusive.
      expect(fieldsOf(cellWriteFields('earlyStart', '04 Mar 2026', ctx()))).toEqual({
        constraintType: 'SNET',
        constraintDate: '2026-03-04',
        durationDays: 3,
      });
    });

    it('hand-places the start in Visual mode, and writes NO constraint', () => {
      // D1. A placement is advisory and a constraint is not; the ADR-0033 effective-Visual pass
      // pins the bar afterwards, exactly as it does for a reposition drop. Verified red by
      // returning the Early branch's fragment here.
      const result = fieldsOf(
        cellWriteFields(
          'earlyStart',
          '04 Mar 2026',
          ctx({ schedulingMode: 'VISUAL', barDateSource: 'visual' }),
        ),
      );
      expect(result).toEqual({ visualStart: '2026-03-04', durationDays: 3 });
      expect(result).not.toHaveProperty('constraintType');
    });

    it.each([
      ['EARLY' as const, 'early' as const],
      ['VISUAL' as const, 'visual' as const],
    ])('writes a DURATION for a typed finish in %s mode, and no constraint', (mode, source) => {
      // **D3, the branch a reader expects to be FNLT and is not.** A finish-edge resize "spreads
      // neither field, leaving the stored constraint round-tripped verbatim"; a typed finish does
      // the same. Making the grid differ would invent the second answer ADR-0134 exists to prevent.
      // Start stays Mon 2, new finish Tue 10 → 9 calendar days inclusive.
      const result = fieldsOf(
        cellWriteFields(
          'earlyFinish',
          '10 Mar 2026',
          ctx({ schedulingMode: mode, barDateSource: source }),
        ),
      );
      expect(result).toEqual({ durationDays: 9 });
    });

    it('accepts exactly what the cell displays, because the cell is seeded from it', () => {
      // The round trip that matters in practice: a planner opens a date cell, edits one character,
      // and presses Enter. `GanttPanel.tsx:1701` seeds the input from `formatCalendarDate`'s
      // output, so the parser has to accept that form or the product refuses the value it showed.
      expect(
        fieldsOf(cellWriteFields('earlyStart', formatCalendarDate('2026-03-04'), ctx())),
      ).toEqual({
        constraintType: 'SNET',
        constraintDate: '2026-03-04',
        durationDays: 3,
      });
    });

    it('refuses a MANDATORY constraint with a reason naming where to change it', () => {
      // D4. Mandatory constraints break logic by design (ADR-0035 §7), so swapping one for an SNET
      // changes what the whole downstream chain means — a trade that belongs where the constraint
      // is named and its consequence is on screen. The reason must be specific: told only that the
      // value was unacceptable, a planner would retype the same, correctly-formatted date.
      const reason = reasonOf(
        cellWriteFields(
          'earlyStart',
          '04 Mar 2026',
          ctx({ activity: activity({ constraintType: 'MANDATORY_START' }) }),
        ),
      );
      expect(reason).toMatch(/mandatory constraint/i);
      expect(reason).toMatch(/activity editor/i);
    });

    it('refuses while the read-only Late overlay is on', () => {
      // The dates on screen are then the LATE pair, which ADR-0033 makes an overlay rather than an
      // input — so a typed value would be applied to different columns than the ones being read.
      // `cell-gate.ts` should keep the cell shut; this is the second lock, because "should already"
      // is how #290 shipped.
      expect(
        reasonOf(cellWriteFields('earlyStart', '04 Mar 2026', ctx({ barDateSource: 'late' }))),
      ).toMatch(/read-only overlay/i);
    });

    it('refuses an unparseable date by NAME, not with the generic sentence', () => {
      expect(reasonOf(cellWriteFields('earlyStart', 'next Tuesday', ctx()))).toMatch(
        /Enter a date like/,
      );
    });

    it('refuses a start after the finish, and a finish before the start', () => {
      expect(reasonOf(cellWriteFields('earlyStart', '20 Mar 2026', ctx()))).toMatch(
        /start cannot be after the finish/i,
      );
      expect(reasonOf(cellWriteFields('earlyFinish', '01 Mar 2026', ctx()))).toMatch(
        /finish cannot be before the start/i,
      );
    });

    it('refuses before the plan has been calculated, rather than inventing a duration', () => {
      // With no span there is no end to hold, so any `durationDays` would be a claim about a
      // schedule that does not exist yet.
      const uncomputed = activity({ earlyStart: null, earlyFinish: null });
      expect(
        reasonOf(cellWriteFields('earlyStart', '04 Mar 2026', ctx({ activity: uncomputed }))),
      ).toMatch(/has not been calculated/i);
    });
  });

  /**
   * A value each key accepts, if it accepts anything at all.
   *
   * **Total over `GanttCellKey`, and the compiler is the enforcement** — a key added without a
   * sample fails to typecheck rather than being silently skipped by the loop below, which is how a
   * roster test comes to pass over a roster it is not reading (ADR-0093).
   */
  const ACCEPTED_SAMPLE: Record<GanttCellKey, string> = {
    name: 'Renamed',
    duration: '3d',
    percentComplete: '50',
    // Inside the fixture's Mon 2 – Fri 6 March span, so a refusal here means the KEY is
    // refused rather than the sample being out of range — a gate that fails for the wrong reason
    // teaches the next reader to widen it.
    earlyStart: '2026-03-03',
    earlyFinish: '2026-03-09',
  };

  it('never lists a column as editable that the commit path refuses outright', () => {
    /**
     * **`docs/TECH_DEBT.md` #290, and it is the RELATIONSHIP that was wrong rather than either
     * side.** `GANTT_EDITABLE_COLUMNS` decides whether a cell opens; `cellWriteFields` decides
     * whether anything can be written. Both files were internally correct and defensible, and
     * nothing compared them — so `earlyStart`/`earlyFinish` were listed as editable while the
     * commit returned `null` for every input, and the grid answered "That value is not something
     * this cell accepts." to a correctly-formatted date. Live since `web-v0.92.0`.
     *
     * Asserting "the two keys are absent" would fix today and not the class. This asks the
     * question that was never asked: for every column the grid will OPEN, is there any value it
     * takes? A key whose editor can only ever refuse is an entry point with no capability —
     * ADR-0081's shape inverted — and the planner is told they typed it wrong.
     */
    const listed = Object.entries(GANTT_EDITABLE_COLUMNS).filter(
      (entry): entry is [string, GanttCellKey] => entry[1] !== undefined,
    );
    // A pinned positive: an empty roster would satisfy the loop below perfectly, and a green run
    // could not then tell "every editable column works" from "no column is editable".
    expect(listed.length).toBeGreaterThan(0);

    for (const [column, key] of listed) {
      const result = cellWriteFields(key, ACCEPTED_SAMPLE[key], ctx());
      expect(
        result.ok,
        `column "${column}" opens an editor but cellWriteFields("${key}") refuses every value` +
          (result.ok ? '' : ` — it said: ${result.reason}`),
      ).toBe(true);
    }
  });
});

describe('describeCommitFailure', () => {
  it('names the pen for a 423, and does not mark the row stale', () => {
    expect(describeCommitFailure(apiError(423))).toEqual({
      message: 'Someone else is editing this plan.',
      stale: false,
    });
  });

  it('marks a 409 stale, because retrying with the version we hold would fail identically', () => {
    expect(describeCommitFailure(apiError(409))).toMatchObject({ stale: true });
  });

  it("passes the server's own message through for anything else", () => {
    // A 422 from the DTO says exactly which field and why. Replacing it with "something went wrong"
    // throws away the only part a planner could act on.
    expect(describeCommitFailure(apiError(422, 'durationMinutes must not be less than 0'))).toEqual(
      {
        message: 'durationMinutes must not be less than 0',
        stale: false,
      },
    );
  });

  it('has a sentence for a non-API failure too', () => {
    expect(describeCommitFailure(new Error('offline'))).toMatchObject({
      message: 'That change could not be saved.',
    });
  });
});

describe('commitCell', () => {
  it('sends the row version, so a concurrent edit is caught rather than overwritten', async () => {
    const update = vi.fn().mockResolvedValue(activity({ durationMinutes: 240 }));
    const result = await commitCell({
      activity: activity(),
      key: 'duration',
      text: '4h',
      hoursPerDay: EIGHT_HOUR,
      schedulingMode: 'EARLY',
      barDateSource: 'early',
      update,
    });

    // A `patch` slice, not a whole definition. `useUpdateActivity` would have sent the latter and a
    // rename could then quietly rewrite a constraint — the partial PATCH exists for exactly the
    // per-scope reason ADR-0060 §4 records, and a cell is that argument at its smallest.
    expect(update).toHaveBeenCalledWith({
      activityId: 'a1',
      version: 7,
      patch: { durationMinutes: 240 },
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('refuses locally without calling the server when the text is not sendable', async () => {
    const update = vi.fn();
    const result = await commitCell({
      activity: activity(),
      key: 'duration',
      text: '2 weeks',
      hoursPerDay: EIGHT_HOUR,
      schedulingMode: 'EARLY',
      barDateSource: 'early',
      update,
    });

    // A round trip to learn what the parser already knew is latency spent on nothing, and the
    // server's 422 would be about a field rather than about the grammar the planner typed in.
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
  });

  it('turns a refusal into a result, never an exception', async () => {
    // The cell-edit model has an `error` state that keeps the planner's text; a thrown error would
    // go around it and the text would be lost.
    const update = vi.fn().mockRejectedValue(apiError(423));
    const result = await commitCell({
      activity: activity(),
      key: 'name',
      text: 'Piling',
      hoursPerDay: EIGHT_HOUR,
      schedulingMode: 'EARLY',
      barDateSource: 'early',
      update,
    });

    expect(result).toEqual({
      ok: false,
      failure: { message: 'Someone else is editing this plan.', stale: false },
    });
  });
});
