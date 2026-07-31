import { DEFAULT_SEED_PLAN_OPTIONS, type SeedSpec } from '@repo/seed';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SeedClient } from './client.js';
import { fixtureSpec } from './fixture.js';
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

/** Every write returns a fresh id; reads return `{}`. */
function acceptEverything(): typeof fetch {
  let n = 0;
  return vi.fn((_url: string, init?: RequestInit) => {
    n += 1;
    return Promise.resolve(json(init?.method === 'POST' ? 201 : 200, { data: { id: `id-${n}` } }));
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
      const path = url;
      if (path.includes('/activities') && init?.method === 'POST') {
        return Promise.resolve(json(422, { error: { code: 'VALIDATION_FAILED', message: 'no' } }));
      }
      return Promise.resolve(
        json(init?.method === 'POST' ? 201 : 200, { data: { id: `id-${calls}` } }),
      );
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
      // 4 hours = 240 minutes. The public API takes only an integer `durationDays` (TECH_DEBT #77),
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

describe('fixtureSpec', () => {
  it('maps the whole fixture and names what has no SchedulePoint concept', () => {
    const spec = fixtureSpec();
    // 129 real activities + 18 WBS nodes, each of which becomes a WBS_SUMMARY activity (ADR-0038).
    expect(spec.activities.length).toBe(129 + 18);
    expect(spec.dependencies).toHaveLength(188);
    expect(spec.calendars).toHaveLength(8);
    expect(spec.resources).toHaveLength(22);
    expect(spec.assignments).toHaveLength(45);

    // Roles, activity-code types and UDFs have no schema here. Reported, never silently dropped —
    // a reader must be able to tell "the app cannot hold this" from "the seeder forgot".
    const kinds = new Set(spec.unplaceable.map((u) => u.entity));
    expect(kinds).toEqual(new Set(['role', 'activity_code_type', 'udf_definition']));
    expect(spec.unplaceable.every((u) => u.reason.length > 0)).toBe(true);
  });

  it('maps P6 activity kinds to the domain, including Level of Effort', () => {
    const spec = fixtureSpec();
    const byType = new Map<string, number>();
    for (const activity of spec.activities) {
      byType.set(activity.type, (byType.get(activity.type) ?? 0) + 1);
    }
    // TASK_DEPENDENT is P6's name for an ordinary task; LOE is the capability the importer was
    // silently coercing away (the defect that motivated ADR-0066).
    expect(byType.get('TASK')).toBe(103);
    expect(byType.get('LEVEL_OF_EFFORT')).toBe(5);
    expect(byType.get('RESOURCE_DEPENDENT')).toBe(2);
    expect(byType.get('WBS_SUMMARY')).toBe(3 + 18);
  });

  it('carries the conformance test tags, so coverage is computable', () => {
    const tagged = fixtureSpec().activities.filter((a) => a.testTags.length > 0);
    expect(tagged.length).toBeGreaterThan(0);
  });
});

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
