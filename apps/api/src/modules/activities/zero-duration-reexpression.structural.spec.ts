import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripComments } from '../../common/contracts/cost-key-scan';

import { REEXPRESSED_DATE_FIELDS } from './zero-duration-reexpression';

/**
 * **The convention table cannot drift from the engine** (plan M2-T1, risk R3).
 *
 * `reexpressZeroDurationDates` is correct only while it re-expresses exactly the inputs the engine
 * reads in the finish-milestone convention. The engine's definition of that convention is every call
 * to `finishMilestoneDateInstant` (`engine/instants.ts`): the one conversion that reads a date as the
 * END of its day. This gate collects every call in a non-test engine file and maps its date argument
 * to the activity field it reads.
 *
 * - A **new call** (a sixth input read at the end of its day) fails the census, naming the file and
 *   the argument, until the field is added to `REEXPRESSED_DATE_FIELDS` or the call is classified.
 * - A **removed call** fails too, because then the rule re-expresses a field the engine no longer
 *   reads in that convention, which would move the activity rather than keep it.
 *
 * `constraints.ts`'s `resolvePair` reads both the primary and the secondary constraint date through one
 * call, so its argument `constraintDate` is mapped to both; that mapping is written below rather than
 * inferred, and a pinned positive case asserts the census found the four calls it expects, so a regex
 * that matched nothing could not pass (ADR-0093's rule for a census).
 *
 * **What it does not see:** a site that reads a date at the end of its day by some other route than
 * `finishMilestoneDateInstant` (for example an inline `nextCalendarDay`), or `reportIndex`'s
 * `finishMilestoneDisplayIndex`, which is an OUTPUT conversion and moves no input.
 */
const ENGINE = join(__dirname, '..', 'schedule', 'engine');

/** Argument text at each call → the activity fields it reads. */
const ARGUMENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'activity.visualStart': ['visualStart'],
  constraintDate: ['constraintDate', 'secondaryConstraintDate'],
  'activity.externalEarlyStart': ['externalEarlyStart'],
  'activity.externalLateFinish': ['externalLateFinish'],
};

interface Call {
  file: string;
  argument: string;
}

function census(): Call[] {
  const calls: Call[] = [];
  for (const file of readdirSync(ENGINE)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    const src = stripComments(readFileSync(join(ENGINE, file), 'utf8'));
    for (const m of src.matchAll(
      /finishMilestoneDateInstant\(\s*([^,()]+?)\s*,\s*([^()]+?)\s*\)/g,
    )) {
      const params = m[2] ?? '';
      // The definition `(cal: WorkingTimeCalendar, date: string)` is not a call.
      if (params.includes(':')) continue;
      calls.push({ file, argument: params });
    }
  }
  return calls.sort((a, b) => `${a.file}${a.argument}`.localeCompare(`${b.file}${b.argument}`));
}

describe('the re-expression rule covers every finish-milestone date input', () => {
  it('finds the four engine calls it expects (pinned positive case)', () => {
    expect(census()).toEqual([
      { file: 'compute.ts', argument: 'activity.visualStart' },
      { file: 'constraints.ts', argument: 'activity.externalEarlyStart' },
      { file: 'constraints.ts', argument: 'activity.externalLateFinish' },
      { file: 'constraints.ts', argument: 'constraintDate' },
    ]);
  });

  it('every call reads a field the rule re-expresses, and every re-expressed field is read', () => {
    const read = new Set<string>();
    for (const call of census()) {
      const fields = ARGUMENT_FIELDS[call.argument];
      expect(fields, `${call.file}: unclassified argument "${call.argument}"`).toBeDefined();
      for (const f of fields ?? []) read.add(f);
    }
    expect([...read].sort()).toEqual([...REEXPRESSED_DATE_FIELDS].sort());
  });
});
