import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripComments } from '../../common/contracts/cost-key-scan';

import { REEXPRESSED_DATE_FIELDS } from './zero-duration-reexpression';

/**
 * **The convention table cannot drift from the engine** (plan M2-T1, risk R3).
 *
 * `reexpressZeroDurationDates` is correct only while it re-expresses exactly the inputs the engine
 * reads in the finish-milestone convention. That convention lives in `engine/instants.ts`:
 * `finishMilestoneDateInstant` reads a date as the END of its day, and since #385 (ADR-0161 D3) the
 * two date readers `startDateInstant` and `finishDateInstant` apply it whenever the activity is a
 * finish milestone. This gate collects every call to any of the three in a non-test engine file and
 * maps the DATE argument (the second for `finishMilestoneDateInstant` and `startDateInstant`, the
 * third for `finishDateInstant`) to the activity field it reads. The readers' own bodies, which pass
 * their `date` parameter straight to `finishMilestoneDateInstant`, are the convention itself, not
 * callers of it, and are skipped.
 *
 * - A **new call** (a sixth input read through the convention) fails the census, naming the file,
 *   the reader and the argument, until the field is added to `REEXPRESSED_DATE_FIELDS` or the call
 *   is classified.
 * - A **removed call** fails too, because then the rule re-expresses a field the engine no longer
 *   reads in that convention, which would move the activity rather than keep it.
 *
 * `constraints.ts`'s `resolvePair` reads both the primary and the secondary constraint date through
 * its `constraintDate` parameter, so that argument maps to both; `clampExternalBackwardFinish` reads
 * `activity.externalLateFinish` through a local `external`. Both mappings are written below rather
 * than inferred, and a pinned positive case asserts the census found the five calls it expects, so a
 * parser that matched nothing could not pass (ADR-0093's rule for a census).
 *
 * **What it does not see:** a site that reads a date at the end of its day by some other route (for
 * example an inline `nextCalendarDay`), a reader called outside the engine (the cross-plan
 * derivation reads remote and M1 external dates through the readers, which is ADR-0161's subject and
 * reads the same stored fields listed here), or `reportIndex`'s `finishMilestoneDisplayIndex`, which
 * is an OUTPUT conversion and moves no input.
 */
const ENGINE = join(__dirname, '..', 'schedule', 'engine');

/** Which argument of each reader is the date it reads. */
const DATE_ARGUMENT: Readonly<Record<string, number>> = {
  finishMilestoneDateInstant: 1,
  startDateInstant: 1,
  finishDateInstant: 2,
};

/** Argument text at each call → the activity fields it reads. */
const ARGUMENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'activity.visualStart': ['visualStart'],
  constraintDate: ['constraintDate', 'secondaryConstraintDate'],
  'activity.externalEarlyStart': ['externalEarlyStart'],
  external: ['externalLateFinish'],
};

interface Call {
  file: string;
  reader: string;
  argument: string;
}

/** The top-level comma-separated arguments of the call whose `(` is at `open`. */
function argumentsAt(src: string, open: number): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i]!;
    if (ch === '(') {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        if (current.trim() !== '') args.push(current.trim());
        return args;
      }
    } else if (ch === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  return null;
}

function census(): Call[] {
  const calls: Call[] = [];
  for (const file of readdirSync(ENGINE)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    const src = stripComments(readFileSync(join(ENGINE, file), 'utf8'));
    for (const m of src.matchAll(
      /\b(finishMilestoneDateInstant|startDateInstant|finishDateInstant)\s*\(/g,
    )) {
      const reader = m[1]!;
      const args = argumentsAt(src, m.index + m[0].length - 1);
      if (!args) continue;
      // A definition `(cal: WorkingTimeCalendar, …)` is not a call.
      if (args.some((a) => a.includes(':'))) continue;
      const argument = args[DATE_ARGUMENT[reader]!] ?? '';
      // A reader delegating its own `date` parameter is the convention, not a caller of it.
      if (file === 'instants.ts' && argument === 'date') continue;
      // `planLevellingApplication` asks what a date it DERIVED (a levelled target) would place at, so
      // that it and Pass 2 agree about what a placement date means. The date is an output of the
      // levelling pass, not a stored activity field, so there is nothing for the rule to re-express.
      if (file === 'apply-levelling.ts' && argument === 'date') continue;
      calls.push({ file, reader, argument });
    }
  }
  return calls.sort((a, b) =>
    `${a.file}${a.reader}${a.argument}`.localeCompare(`${b.file}${b.reader}${b.argument}`),
  );
}

describe('the re-expression rule covers every finish-milestone date input', () => {
  it('finds the five engine calls it expects (pinned positive case)', () => {
    expect(census()).toEqual([
      // Pass 2 reads a placement through `startDateInstant`, the same reader the constraint clamps
      // use, since apply-levelled-dates T1.1; it called `finishMilestoneDateInstant` inline before.
      { file: 'compute.ts', reader: 'startDateInstant', argument: 'activity.visualStart' },
      { file: 'constraints.ts', reader: 'finishDateInstant', argument: 'constraintDate' },
      { file: 'constraints.ts', reader: 'finishDateInstant', argument: 'external' },
      {
        file: 'constraints.ts',
        reader: 'startDateInstant',
        argument: 'activity.externalEarlyStart',
      },
      { file: 'constraints.ts', reader: 'startDateInstant', argument: 'constraintDate' },
    ]);
  });

  it('every call reads a field the rule re-expresses, and every re-expressed field is read', () => {
    const read = new Set<string>();
    for (const call of census()) {
      const fields = ARGUMENT_FIELDS[call.argument];
      expect(
        fields,
        `${call.file}: ${call.reader} reads unclassified argument "${call.argument}"`,
      ).toBeDefined();
      for (const f of fields ?? []) read.add(f);
    }
    expect([...read].sort()).toEqual([...REEXPRESSED_DATE_FIELDS].sort());
  });
});
