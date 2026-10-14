import { describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_ROW_CAP,
  collectPreview,
  main,
  printable,
  renderPreview,
  type PreviewData,
  type PreviewItem,
  type PreviewSettings,
} from './clear-out-preview';

/** The words an operator reads. The numbers come from the selector, tested where it is. */
const NOW = new Date('2026-10-20T14:03:00.000Z');
const OFF: PreviewSettings = { enabled: false, retentionDays: 90, sweepIntervalMinutes: 60 };
const ON: PreviewSettings = { ...OFF, enabled: true };

function item(over: Partial<PreviewItem> = {}): PreviewItem {
  return {
    kind: 'plan',
    id: 'pl-1',
    name: 'Old base',
    organizationId: 'org-1',
    deletedAt: new Date('2026-07-10T09:00:00.000Z'),
    daysPast: 12,
    projects: 0,
    plans: 1,
    activities: 140,
    overdue: false,
    ...over,
  };
}

function data(over: Partial<PreviewData> = {}): PreviewData {
  return {
    now: NOW,
    settings: OFF,
    organizations: new Map([['org-1', 'Acme Builders']]),
    due: [],
    dueSoon: [],
    ...over,
  };
}

describe('renderPreview', () => {
  it('says plainly that the clear-out is off and nothing would be removed', () => {
    const text = renderPreview(data());
    expect(text).toContain('SchedulePoint clear-out preview — 2026-10-20 14:03 UTC');
    expect(text).toContain('The clear-out is OFF on this server. Period: 90 days.');
    expect(text).toContain('Nothing is past its 90 days.');
    expect(text.trimEnd().endsWith('Nothing has been changed.')).toBe(true);
  });

  it('lists what would be removed, by organisation, with what goes with each', () => {
    const text = renderPreview(
      data({
        due: [
          item({
            kind: 'client',
            name: 'Northgate',
            deletedAt: new Date('2026-06-01T09:00:00.000Z'),
            daysPast: 51,
            projects: 2,
            plans: 5,
            activities: 812,
          }),
          item(),
        ],
        dueSoon: [
          item({
            kind: 'project',
            name: 'Riverside',
            deletedAt: new Date('2026-07-25T09:00:00.000Z'),
            daysPast: -3,
            plans: 1,
            activities: 60,
          }),
        ],
      }),
    );
    expect(text).toContain('If it were switched on now, these would be permanently removed:');
    expect(text).toContain('Organisation "Acme Builders"');
    expect(text).toContain(
      'Client  "Northgate"  deleted 2026-06-01 (51 days past)  with 2 projects, 5 plans, 812 activities',
    );
    expect(text).toContain(
      'Plan    "Old base"  deleted 2026-07-10 (12 days past)  with 140 activities',
    );
    expect(text).toContain('Due within the next 7 days:');
    expect(text).toContain(
      'Project "Riverside"  deleted 2026-07-25 (due in 3 days)  with 1 plan, 60 activities',
    );
    expect(text).toContain('Total now: 1 client, 1 plan (2 projects, 6 plans, 952 activities).');
    expect(text).toContain('The first run takes all of it.');
  });

  it('reads "still waiting" with the switch on and flags an overdue item for the maintainers', () => {
    const text = renderPreview(data({ settings: ON, due: [item({ overdue: true })] }));
    expect(text).toContain('The clear-out is ON on this server.');
    expect(text).toContain('Still waiting to be removed:');
    expect(text).toContain('OVERDUE — send this output to the maintainers');
    expect(text).not.toContain('If it were switched on now');
  });

  it('does not flag overdue with the switch off, where nothing is meant to be removed', () => {
    expect(renderPreview(data({ due: [item({ overdue: false })] }))).not.toContain('OVERDUE');
  });

  it('caps the list, keeps the totals whole and says how many runs it will take', () => {
    const many = Array.from({ length: 2_100 }, (_, i) =>
      item({ name: `Plan ${i}`, activities: 1, deletedAt: new Date(2026, 0, 1, 0, 0, i) }),
    );
    const text = renderPreview(data({ settings: ON, due: many }));
    expect(text.match(/\n {2}Plan {4}"Plan /g)).toHaveLength(PREVIEW_ROW_CAP);
    expect(text).toContain(`…and ${2_100 - PREVIEW_ROW_CAP} more not listed here`);
    expect(text).toContain('Total now: 2100 plans (0 projects, 2100 plans, 2100 activities).');
    expect(text).toContain('expect at least 2 hourly runs');
  });

  it('prints the oldest first within an organisation', () => {
    const text = renderPreview(
      data({
        due: [
          item({ name: 'Newer', deletedAt: new Date('2026-08-01T00:00:00.000Z') }),
          item({ name: 'Older', deletedAt: new Date('2026-06-01T00:00:00.000Z') }),
        ],
      }),
    );
    expect(text.indexOf('"Older"')).toBeLessThan(text.indexOf('"Newer"'));
  });
});

describe('printable', () => {
  it('replaces control, escape and bidirectional characters so a name cannot forge the report', () => {
    expect(printable('a\nNothing is past\x1b[2K')).toBe('a\uFFFDNothing is past\uFFFD[2K');
    expect(printable('evil\u202Egnp.txt\u2066x\u2069')).toBe('evil\uFFFDgnp.txt\uFFFDx\uFFFD');
    expect(printable('Northgate – Ünïcode 日本')).toBe('Northgate – Ünïcode 日本');
  });

  it('is applied to every item name and organisation name in the report', () => {
    const hostile = 'x"\nNothing is past its 90 days.\u202E';
    const text = renderPreview(
      data({
        organizations: new Map([['org-1', hostile]]),
        due: [item({ name: hostile })],
      }),
    );
    expect([...text].filter((ch) => ch !== '\n' && /\p{C}/u.test(ch))).toEqual([]);
    // No line of the report starts with a sentence a name supplied.
    expect(text.split('\n').filter((l) => l.startsWith('Nothing is past'))).toEqual([]);
    expect(text).toContain('x"\uFFFDNothing is past its 90 days.\uFFFD');
  });

  it('also covers an organisation id used when the name is missing', () => {
    const text = renderPreview(
      data({ organizations: new Map(), due: [item({ organizationId: 'a\nb' })] }),
    );
    expect(text).toContain('Organisation "a\uFFFDb"');
  });
});

describe('collectPreview thresholds', () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const now = new Date('2026-10-20T14:03:00.000Z');
  const cutoff = new Date(now.getTime() - 90 * DAY);

  /** A reader holding plans by deletedAt, answering the selector's `lt` the way Postgres would. */
  function reader(plans: Array<{ id: string; deletedAt: Date }>) {
    return {
      client: { findMany: vi.fn().mockResolvedValue([]) },
      project: { findMany: vi.fn().mockResolvedValue([]) },
      plan: {
        findMany: vi.fn((args: { where: { deletedAt?: { lt: Date } } }) =>
          Promise.resolve(
            plans
              .filter((p) => args.where.deletedAt && p.deletedAt < args.where.deletedAt.lt)
              .map((p) => ({
                ...p,
                name: p.id,
                organizationId: 'org-1',
                deleteBatchId: 'b',
                projectId: 'proj',
              })),
          ),
        ),
      },
      activity: { count: vi.fn().mockResolvedValue(0) },
      organization: { findMany: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme' }]) },
    } as never;
  }

  it('flags overdue only past one day plus one interval, and only with the switch on', async () => {
    const limit = DAY + 60 * 60_000;
    const past = (ms: number) => new Date(cutoff.getTime() - ms);
    const plans = [
      { id: 'inside', deletedAt: past(limit) },
      { id: 'outside', deletedAt: past(limit + 1) },
    ];
    const on = await collectPreview(reader(plans), now, ON);
    expect(Object.fromEntries(on.due.map((i) => [i.name, i.overdue]))).toEqual({
      inside: false,
      outside: true,
    });
    const off = await collectPreview(reader(plans), now, OFF);
    expect(off.due.every((i) => !i.overdue)).toBe(true);
  });

  it('counts whole days past rounding down, and whole days to go rounding up', async () => {
    const plans = [
      { id: 'a', deletedAt: new Date(cutoff.getTime() - (2 * DAY + 23 * HOUR)) },
      { id: 'b', deletedAt: new Date(cutoff.getTime() + (2 * DAY + HOUR)) },
    ];
    const result = await collectPreview(reader(plans), now, ON);
    expect(result.due.map((i) => [i.name, i.daysPast])).toEqual([['a', 2]]);
    expect(result.dueSoon.map((i) => [i.name, i.daysPast])).toEqual([['b', -3]]);
  });

  it('puts exactly seven days ahead outside the window and one millisecond less inside', async () => {
    const edge = cutoff.getTime() + 7 * DAY;
    const result = await collectPreview(
      reader([
        { id: 'at-seven', deletedAt: new Date(edge) },
        { id: 'just-inside', deletedAt: new Date(edge - 1) },
      ]),
      now,
      OFF,
    );
    expect(result.dueSoon.map((i) => i.name)).toEqual(['just-inside']);
  });
});

describe('main', () => {
  it('never echoes a rejected setting value to the terminal', async () => {
    const secret = 'hunter2-do-not-print';
    const prior = { ...process.env };
    process.env['RETENTION_HIERARCHY_ENABLED'] = secret;
    process.env['RETENTION_HIERARCHY_DAYS'] = secret;
    process.env['DATABASE_URL'] = `postgresql://u:${secret}@localhost:1/x`;
    const written: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      expect(await main()).toBe(2);
    } finally {
      spy.mockRestore();
      process.env = prior;
    }
    expect(written.join('')).toContain('RETENTION_HIERARCHY_ENABLED');
    expect(written.join('')).not.toContain(secret);
  });
});
