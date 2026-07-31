import { DEFAULT_SEED_PLAN_OPTIONS, type SeedSpec } from '@repo/seed';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SeedClient } from './client.js';
import { seedPlan } from './runner.js';

/**
 * Unit coverage for the seeder against a **mocked** `fetch`. What it can prove here is the shape of
 * what the seeder sends and how it behaves when the API refuses; what it cannot prove is that the
 * payloads are ones the real API accepts. That is deliberately left to running it, and is why the
 * whole design is API-first — a mocked fetch will happily accept a body no server would.
 */

/** The `[url, init]` of one mocked call, narrowed once so the assertions stay readable. */
function callsOf(fetchMock: typeof fetch): Array<{ url: string; method: string; body: string }> {
  return vi.mocked(fetchMock).mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit | undefined];
    return {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
    };
  });
}

/** A `Response`-alike for the mocked `fetch`. */
function json(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [] },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/**
 * Every write returns a fresh id; a **read returns an empty list**, because the only GETs the runner
 * makes are the org-library probes and those return an array in the `{ data }` envelope. Returning an
 * object there would make the runner report a library-read finding on every test.
 */
function acceptEverything(): typeof fetch {
  let n = 0;
  return vi.fn((_url: string, init?: RequestInit) => {
    n += 1;
    const method = init?.method ?? 'GET';
    if (method === 'GET') return Promise.resolve(json(200, { data: [] }));
    return Promise.resolve(json(method === 'POST' ? 201 : 200, { data: { id: `id-${n}` } }));
  }) as unknown as typeof fetch;
}

function minimalSpec(overrides: Partial<SeedSpec> = {}): SeedSpec {
  return {
    seedName: 'unit-test',
    tier: 'capability',
    plan: {
      name: 'Unit test',
      description: null,
      dataDate: '2026-01-05',
      defaultCalendarKey: null,
      currencyCode: null,
      options: DEFAULT_SEED_PLAN_OPTIONS,
    },
    calendars: [],
    resources: [],
    activities: [],
    dependencies: [],
    assignments: [],
    unplaceable: [],
    ...overrides,
  };
}

const target = { orgSlug: 'acme', projectId: 'proj-1' };

describe('seedPlan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('takes the pen before structural writes and releases it after', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(new SeedClient({ baseUrl: 'http://x' }), target, minimalSpec());

    const calls = callsOf(fetchMock);
    const acquired = calls.findIndex((c) => c.url.endsWith('/edit-lock') && c.method === 'POST');
    const released = calls.findIndex((c) => c.url.endsWith('/edit-lock') && c.method === 'DELETE');
    expect(acquired).toBeGreaterThanOrEqual(0);
    // Released, and after it was taken — a leaked lease blocks the plan for its whole TTL and
    // nothing announces it, so this is the assertion that matters most about the pen.
    expect(released).toBeGreaterThan(acquired);
  });

  it('releases the pen even when a structural write fails', async () => {
    let calls = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls += 1;
      const method = init?.method ?? 'GET';
      if (method === 'GET') return Promise.resolve(json(200, { data: [] }));
      if (url.includes('/activities') && method === 'POST') {
        return Promise.resolve(json(422, { error: { code: 'VALIDATION_FAILED', message: 'no' } }));
      }
      return Promise.resolve(json(method === 'POST' ? 201 : 200, { data: { id: `id-${calls}` } }));
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const result = await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({ activities: [activity('A1')] }),
    );

    const released = callsOf(fetchMock).some(
      (call) => call.url.endsWith('/edit-lock') && call.method === 'DELETE',
    );
    expect(released).toBe(true);
    // The refusal is a FINDING and the run continues — one gap must not hide the rest.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.code).toBe('VALIDATION_FAILED');
    expect(result.planId).not.toBeNull();
  });

  it('records a rounding when a duration is not a whole number of days', async () => {
    globalThis.fetch = acceptEverything();
    const result = await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      // 4 hours = 240 minutes. The public API takes only an integer `durationDays` (TECH_DEBT #78),
      // so this cannot be created faithfully by ANY client — and the report has to say so, or the
      // seeded plan quietly claims to be the fixture when it is a rounded copy.
      minimalSpec({ activities: [activity('A1', 240)] }),
    );
    expect(result.approximations).toHaveLength(1);
    expect(result.approximations[0]?.detail).toContain('240 min');
    expect(result.approximations[0]?.reason).toContain('whole working days');
  });

  it('does not record a rounding when the duration is already whole days', async () => {
    globalThis.fetch = acceptEverything();
    const result = await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({ activities: [activity('A1', 2880)] }),
    );
    expect(result.approximations).toHaveLength(0);
  });

  it('sets WBS parentage in one batched write, not one PATCH per child', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({
        activities: [
          { ...activity('W1'), key: 'W1', type: 'WBS_SUMMARY', durationMinutes: 0 },
          { ...activity('A1'), key: 'A1', parentKey: 'W1' },
          { ...activity('A2'), key: 'A2', parentKey: 'W1' },
        ],
      }),
    );
    const parentCalls = callsOf(fetchMock).filter((call) =>
      call.url.endsWith('/activities/parents'),
    );
    expect(parentCalls).toHaveLength(1);
  });

  it('carries the plan-level scheduling options through', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({
        plan: {
          ...minimalSpec().plan,
          options: { ...DEFAULT_SEED_PLAN_OPTIONS, levelResources: true, totalFloatMode: 'START' },
        },
      }),
    );
    const patch = callsOf(fetchMock).find((call) => call.method === 'PATCH');
    const body = JSON.parse(patch?.body ?? '{}') as Record<string, unknown>;
    expect(body.levelResources).toBe(true);
    expect(body.totalFloatMode).toBe('START');
  });
});

describe('the payload contracts the real API enforces', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends WBS parentage as `parents` rows carrying each child’s optimistic version', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({
        activities: [
          { ...activity('W1'), type: 'WBS_SUMMARY', durationMinutes: 0 },
          { ...activity('A1'), parentKey: 'W1' },
        ],
      }),
    );
    const parents = callsOf(fetchMock).find((call) => call.url.endsWith('/activities/parents'));
    const body = JSON.parse(parents?.body ?? '{}') as { parents?: unknown[] };
    expect(body.parents).toHaveLength(1);
    // `version` is not optional here: the batch is an optimistic write like any other, and omitting
    // it is a 422 rather than a silent overwrite.
    expect(body.parents?.[0]).toEqual({
      id: expect.any(String) as unknown,
      parentId: expect.any(String) as unknown,
      version: expect.any(Number) as unknown,
    });
  });

  it('keeps the progress endpoint to schedule progress only', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({ activities: [{ ...activity('A1'), progress: progress() }] }),
    );
    const call = callsOf(fetchMock).find((c) => c.url.endsWith('/progress'));
    const body = JSON.parse(call?.body ?? '{}') as Record<string, unknown>;

    // `status` is DERIVED from the actuals by the service; the measure and the physical value belong
    // to the ACTIVITY (ADR-0042). Sending any of the three here is a 422, and each was.
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('percentCompleteType');
    expect(body).not.toHaveProperty('physicalPercentComplete');
    // Minutes in the spec model, whole days at the API (TECH_DEBT #78).
    expect(body).not.toHaveProperty('remainingDurationMinutes');
    expect(body.remainingDurationDays).toBe(3);
    expect(body.percentComplete).toBe(40);
    expect(body.version).toEqual(expect.any(Number));
    // A calendar DATE, not the spec's minute-granular instant.
    expect(body.actualStart).toBe('2026-03-01');
  });

  it('puts the percent-complete measure and the physical value on the activity create', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({
        activities: [
          {
            ...activity('A1'),
            progress: {
              ...progress(),
              percentCompleteType: 'PHYSICAL',
              physicalPercentComplete: 25,
            },
          },
        ],
      }),
    );
    const create = callsOf(fetchMock).find(
      (c) => c.method === 'POST' && c.url.endsWith('/activities'),
    );
    const body = JSON.parse(create?.body ?? '{}') as Record<string, unknown>;
    expect(body.percentCompleteType).toBe('PHYSICAL');
    expect(body.physicalPercentComplete).toBe(25);
  });

  it('sends the working week as a Monday-indexed 7-bit mask', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      // Monday–Friday. The spec model numbers 0 = Sunday; the API's mask is Monday-indexed, so this
      // is `0b0011111` = 31. Off by one bit and the calendar is still valid — it just describes a
      // different week, and nothing anywhere fails.
      minimalSpec({ calendars: [calendar({ workingWeekdays: [1, 2, 3, 4, 5] })] }),
    );
    const create = callsOf(fetchMock).find(
      (c) => c.method === 'POST' && c.url.endsWith('/calendars'),
    );
    const body = JSON.parse(create?.body ?? '{}') as Record<string, unknown>;
    expect(body.workingWeekdays).toBe(0b0011111);
  });

  it('reports a window-only calendar rather than inventing a working week for it', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    const result = await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({ calendars: [calendar({ workingWeekdays: [] })] }),
    );
    // ADR-0036 supports a non-working base week whose work comes entirely from dated windows; the
    // API's `@Min(1)` forbids it (TECH_DEBT #79). Fudging in a Monday would make the plan schedule
    // differently from the catalogue and say nothing about it, so it is a finding and no POST.
    expect(result.findings.map((f) => f.code)).toContain('WINDOW_ONLY_CALENDAR_UNSUPPORTED');
    expect(
      callsOf(fetchMock).some((c) => c.method === 'POST' && c.url.endsWith('/calendars')),
    ).toBe(false);
  });

  it('writes one exception row per date, first-wins on a duplicate', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({
        calendars: [
          calendar({
            workingWeekdays: [1, 2, 3, 4, 5],
            // A `date_range` expansion overlapping a single-date entry — which the fixture does. The
            // API rejects the second write on that date, so the run must dedupe rather than collide.
            exceptions: [
              { date: '2026-12-24', windows: [], label: 'shutdown' },
              { date: '2026-12-25', windows: [], label: 'shutdown' },
              { date: '2026-12-25', windows: [], label: 'Christmas Day' },
            ],
          }),
        ],
      }),
    );
    const posted = callsOf(fetchMock).filter((c) => c.url.includes('/exceptions'));
    expect(posted).toHaveLength(2);
    expect(posted.map((c) => (JSON.parse(c.body) as { date: string }).date)).toEqual([
      '2026-12-24',
      '2026-12-25',
    ]);
  });

  it('sets the plan’s default calendar on the update, never on the create', async () => {
    const fetchMock = acceptEverything();
    globalThis.fetch = fetchMock;
    await seedPlan(
      new SeedClient({ baseUrl: 'http://x' }),
      target,
      minimalSpec({
        calendars: [calendar({ workingWeekdays: [1, 2, 3, 4, 5] })],
        plan: { ...minimalSpec().plan, defaultCalendarKey: 'CAL-1' },
      }),
    );
    const calls = callsOf(fetchMock);
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/plans'));
    const update = calls.find((c) => c.method === 'PATCH' && /\/plans\/[^/]+$/.test(c.url));
    // `CreatePlanDto` does not accept a calendar; sending one there is a 422.
    expect(JSON.parse(create?.body ?? '{}')).not.toHaveProperty('calendarId');
    expect(JSON.parse(update?.body ?? '{}')).toHaveProperty('calendarId');
  });
});

function calendar(
  overrides: { workingWeekdays: number[] } & Partial<
    Pick<SeedSpec['calendars'][number], 'exceptions'>
  >,
): SeedSpec['calendars'][number] {
  return {
    key: 'CAL-1',
    name: 'Test calendar',
    scope: 'PROJECT',
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      windows: overrides.workingWeekdays.includes(weekday)
        ? [{ startMinute: 480, endMinute: 960 }]
        : [],
    })),
    exceptions: overrides.exceptions ?? [],
  };
}

function progress(): NonNullable<SeedSpec['activities'][number]['progress']> {
  return {
    status: 'IN_PROGRESS',
    percentComplete: 40,
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    actualStart: '2026-03-01T08:00',
    actualFinish: null,
    remainingDurationMinutes: 3 * 1440,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
  };
}

function activity(code: string, durationMinutes = 1440): SeedSpec['activities'][number] {
  return {
    key: code,
    code,
    name: code,
    type: 'TASK',
    durationMinutes,
    calendarKey: null,
    parentKey: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    scheduleAsLateAsPossible: false,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    externalEarlyStart: null,
    externalLateFinish: null,
    levelingPriority: null,
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    steps: [],
    progress: null,
    visualStart: null,
    testTags: [],
  };
}
