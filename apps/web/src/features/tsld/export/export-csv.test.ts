import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { buildScheduleCsv, csvCell, CSV_BOM, SCHEDULE_COLUMNS } from './export-csv';

/** A full `ActivitySummary` with sensible defaults; overrides narrow it per test. Only the CSV-read
 * fields matter, but the cast keeps the factory terse without listing the whole engine-output surface. */
function act(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    code: 'A100',
    name: 'Excavate',
    type: 'TASK',
    durationDays: 5,
    status: 'NOT_STARTED',
    percentComplete: 0,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-05',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-05',
    totalFloat: 0,
    freeFloat: 0,
    isCritical: true,
    constraintType: null,
    constraintDate: null,
    parentId: null,
    budgetedExpense: null,
    actualExpense: null,
    ...over,
  } as unknown as ActivitySummary;
}

const NO_PARENT = { scope: 'all' as const, resolveWbsParent: () => '' };

/** Split a CSV into its records (safe here because these fixtures use no embedded newlines). */
function lines(csv: string): string[] {
  return csv.replace(CSV_BOM, '').split('\r\n');
}

describe('csvCell — RFC-4180 quoting', () => {
  it('leaves a plain value untouched', () => {
    expect(csvCell('Excavate')).toBe('Excavate');
    expect(csvCell('')).toBe('');
  });

  it('quotes a value containing a comma', () => {
    expect(csvCell('Excavate, north')).toBe('"Excavate, north"');
  });

  it('quotes and doubles an embedded quote', () => {
    expect(csvCell('12" pipe')).toBe('"12"" pipe"');
  });

  it('quotes a value containing a newline', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('csvCell — formula-injection guard', () => {
  it('prefixes an apostrophe for every leading formula trigger (= + - @ TAB)', () => {
    // Each value starts with a trigger but holds no comma/quote/newline, so only the apostrophe is added.
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('\tTAB')).toBe("'\tTAB");
  });

  it('neutralises a leading CR THEN RFC-4180-quotes it (CR is also a quote trigger)', () => {
    expect(csvCell('\rdanger')).toBe('"\'\rdanger"');
  });

  it('does not neutralise a trigger character that is not leading', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('name -x')).toBe('name -x');
  });
});

describe('buildScheduleCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads it as UTF-8', () => {
    const csv = buildScheduleCsv([], NO_PARENT);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes a header row in the declared column order', () => {
    const csv = buildScheduleCsv([], NO_PARENT);
    const [header] = lines(csv);
    expect(header).toBe(SCHEDULE_COLUMNS.map((c) => c.header).join(','));
    expect(header).toContain('Code,Name,Type,Duration (days),Status,% complete');
    expect(header).toContain('Total float,Free float,Critical');
  });

  it('renders booleans as Yes/No', () => {
    const csvYes = buildScheduleCsv([act({ isCritical: true })], NO_PARENT);
    const csvNo = buildScheduleCsv([act({ isCritical: false })], NO_PARENT);
    const criticalIndex = SCHEDULE_COLUMNS.findIndex((c) => c.header === 'Critical');
    expect(lines(csvYes)[1]!.split(',')[criticalIndex]).toBe('Yes');
    expect(lines(csvNo)[1]!.split(',')[criticalIndex]).toBe('No');
  });

  it('renders null computed values (dates, floats, expenses) as blank cells', () => {
    const csv = buildScheduleCsv(
      [
        act({
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          totalFloat: null,
          freeFloat: null,
          constraintType: null,
          constraintDate: null,
          budgetedExpense: null,
          actualExpense: null,
        }),
      ],
      NO_PARENT,
    );
    const cells = lines(csv)[1]!.split(',');
    for (const header of [
      'Early start',
      'Late finish',
      'Total float',
      'Free float',
      'Constraint type',
      'Constraint date',
      'Budgeted expense',
      'Actual expense',
    ]) {
      const index = SCHEDULE_COLUMNS.findIndex((c) => c.header === header);
      expect(cells[index]).toBe('');
    }
  });

  it('resolves the WBS-parent column from the supplied resolver', () => {
    const csv = buildScheduleCsv([act({ parentId: 'p1' })], {
      scope: 'all',
      resolveWbsParent: (id) => (id === 'p1' ? 'WBS Site' : ''),
    });
    const index = SCHEDULE_COLUMNS.findIndex((c) => c.header === 'WBS parent');
    expect(lines(csv)[1]!.split(',')[index]).toBe('WBS Site');
  });

  it('serialises a full row exactly (snapshot of the projection + quoting)', () => {
    const csv = buildScheduleCsv(
      [
        act({
          code: 'A100',
          name: 'Excavate',
          type: 'TASK',
          durationDays: 5,
          status: 'IN_PROGRESS',
          percentComplete: 40,
          earlyStart: '2026-01-01',
          earlyFinish: '2026-01-05',
          lateStart: '2026-01-02',
          lateFinish: '2026-01-06',
          totalFloat: 1,
          freeFloat: 0,
          isCritical: false,
          constraintType: 'SNET',
          constraintDate: '2026-01-01',
          parentId: 'p1',
          budgetedExpense: 123456,
          actualExpense: null,
        }),
      ],
      { scope: 'all', resolveWbsParent: (id) => (id === 'p1' ? 'WBS Site' : '') },
    );
    expect(lines(csv)[1]).toBe(
      'A100,Excavate,Task,5,In progress,40,2026-01-01,2026-01-05,2026-01-02,2026-01-06,1,0,No,Start no earlier than,2026-01-01,WBS Site,"1,234.56",',
    );
  });

  it('quotes a name with a comma so the row still parses', () => {
    const csv = buildScheduleCsv([act({ name: 'Excavate, north bay' })], NO_PARENT);
    expect(lines(csv)[1]).toContain('"Excavate, north bay"');
  });

  it('neutralises a formula-injection name', () => {
    const csv = buildScheduleCsv([act({ code: null, name: '=HYPERLINK("evil")' })], NO_PARENT);
    // The Name cell begins with `=`, so it is prefixed and (containing a quote) RFC-4180-quoted.
    expect(lines(csv)[1]).toContain('"\'=HYPERLINK(""evil"")"');
  });

  it('exports every row for scope "all"', () => {
    const csv = buildScheduleCsv(
      [act({ id: 'a1' }), act({ id: 'a2' }), act({ id: 'a3' })],
      NO_PARENT,
    );
    expect(lines(csv)).toHaveLength(1 + 3); // header + 3 rows
  });

  it('exports only the matching subset for scope "matching"', () => {
    const csv = buildScheduleCsv(
      [
        act({ id: 'a1', isCritical: true }),
        act({ id: 'a2', isCritical: false }),
        act({ id: 'a3', isCritical: true }),
      ],
      {
        scope: 'matching',
        resolveWbsParent: () => '',
        isMatching: (a) => a.isCritical,
      },
    );
    expect(lines(csv)).toHaveLength(1 + 2); // header + the two critical rows
  });

  it('exports all rows for scope "matching" when no predicate is supplied (defensive)', () => {
    const csv = buildScheduleCsv([act({ id: 'a1' }), act({ id: 'a2' })], {
      scope: 'matching',
      resolveWbsParent: () => '',
    });
    expect(lines(csv)).toHaveLength(1 + 2);
  });
});
