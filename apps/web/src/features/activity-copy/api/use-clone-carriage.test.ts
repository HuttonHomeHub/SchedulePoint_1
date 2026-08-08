import type { ActivityStep, ResourceAssignmentSummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCloneCarriage } from './use-clone-carriage';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError } from '@/lib/api/client';

/**
 * **Assignment and step carriage** (`docs/specs/activity-copy-paste/` M4).
 *
 * Two of these assertions exist because writing this module got both wrong first, and neither would
 * have been visible on a screen:
 *
 * 1. **Steps are written before assignments.** `PUT …/steps` carries the activity's optimistic
 *    `version`, and an assignment create bumps that version whenever `unitsPerHour` is set
 *    (`persistActivityDuration`). Assignments-first therefore 409s on exactly the activities that
 *    have a resource rate — and passes on every fixture that does not.
 * 2. **An archived resource is detected on `details.reason`, not `code`.** The API throws a
 *    `ValidationError`, whose `code` is `VALIDATION_FAILED` for every instance; the condition is in
 *    `details`. Matching on `code` compiles, reads correctly, and never fires.
 */
const fetchMock = vi.fn();
vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return { ...actual, apiFetch: (...args: unknown[]) => fetchMock(...args) as unknown };
});

afterEach(() => {
  fetchMock.mockReset();
});

function assignment(over: Partial<ResourceAssignmentSummary> = {}): ResourceAssignmentSummary {
  return {
    id: 'as-1',
    activityId: 'src',
    resourceId: 'r-1',
    budgetedUnits: 40,
    unitsPerHour: 1.5,
    isDriving: true,
    curveType: 'UNIFORM',
    lagMinutes: 0,
    actualUnits: 0,
    budgetedCost: null,
    actualCost: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function step(seq: number, name: string): ActivityStep {
  return {
    id: `s-${String(seq)}`,
    activityId: 'src',
    seq,
    name,
    weight: 1,
    percentComplete: 80,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function carriage() {
  return renderHook(() => useCloneCarriage('acme')).result.current;
}

function archivedResourceError(): ApiFetchError {
  return new ApiFetchError(422, {
    code: 'VALIDATION_FAILED',
    message: 'That resource is archived.',
    details: { reason: 'RESOURCE_ARCHIVED' },
  });
}

describe('useCloneCarriage — ordering', () => {
  it('writes the steps BEFORE any assignment, so the create-time version is still current', () => {
    fetchMock.mockResolvedValue([]);
    return carriage()
      .carry({
        cloneId: 'clone',
        cloneVersion: 1,
        sourceName: 'Excavate',
        assignments: [assignment()],
        steps: [step(1, 'Set out')],
      })
      .then(() => {
        const paths = fetchMock.mock.calls.map((c) => String(c[0]));
        const stepsAt = paths.findIndex((p) => p.endsWith('/steps'));
        const assignmentsAt = paths.findIndex((p) => p.endsWith('/assignments'));
        expect(stepsAt).toBeGreaterThanOrEqual(0);
        expect(assignmentsAt).toBeGreaterThanOrEqual(0);
        expect(stepsAt).toBeLessThan(assignmentsAt);
      });
  });

  it('sends the clone’s own version on the steps PUT', () => {
    fetchMock.mockResolvedValue([]);
    return carriage()
      .carry({
        cloneId: 'clone',
        cloneVersion: 7,
        sourceName: 'Excavate',
        assignments: [],
        steps: [step(1, 'Set out')],
      })
      .then(() => {
        const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body).toMatchObject({ version: 7 });
      });
  });

  it('makes no steps request at all when the source has none', () => {
    // An empty PUT is still a write and a version bump, and it is pen-gated (ADR-0060 M0) — so it
    // can fail a paste over an activity that has no steps either way.
    fetchMock.mockResolvedValue([]);
    return carriage()
      .carry({
        cloneId: 'clone',
        cloneVersion: 1,
        sourceName: 'Excavate',
        assignments: [],
        steps: [],
      })
      .then(() => {
        expect(fetchMock).not.toHaveBeenCalled();
      });
  });
});

describe('useCloneCarriage — the archived resource', () => {
  it('skips the assignment, names the resource, and lets the paste succeed', () => {
    // ADR-0053 §4: the source keeps a live assignment to an archived resource; the COPY is a new
    // usage and is refused. Failing the whole paste would stop a planner copying work for a reason
    // that has nothing to do with the copy.
    fetchMock.mockImplementation((path: string) =>
      path.endsWith('/assignments') ? Promise.reject(archivedResourceError()) : Promise.resolve([]),
    );
    return carriage()
      .carry({
        cloneId: 'clone',
        cloneVersion: 1,
        sourceName: 'Excavate',
        assignments: [assignment({ resourceId: 'r-retired' })],
        steps: [],
      })
      .then((result) => {
        expect(result.skipped).toEqual([{ activityName: 'Excavate', resourceId: 'r-retired' }]);
      });
  });

  it('detects it on details.reason — a matcher reading `code` would never fire', () => {
    // Verified red first: with `code === 'RESOURCE_ARCHIVED'` this test throws instead of skipping,
    // because the real API reports `VALIDATION_FAILED` there.
    fetchMock.mockImplementation((path: string) =>
      path.endsWith('/assignments')
        ? Promise.reject(
            new ApiFetchError(422, {
              code: 'VALIDATION_FAILED',
              message: 'archived',
              details: { reason: 'RESOURCE_ARCHIVED' },
            }),
          )
        : Promise.resolve([]),
    );
    return expect(
      carriage().carry({
        cloneId: 'clone',
        cloneVersion: 1,
        sourceName: 'Excavate',
        assignments: [assignment()],
        steps: [],
      }),
    ).resolves.toMatchObject({ skipped: [{ resourceId: 'r-1' }] });
  });

  it('does NOT swallow a 423 — a lost pen stops the paste rather than dropping a resource', () => {
    // The distinction the skip path must not blur: an archived resource is a fact about one
    // assignment; a lost pen is a fact about the whole write. Continuing past it would turn a
    // stopped paste into a quietly incomplete one.
    fetchMock.mockImplementation((path: string) =>
      path.endsWith('/assignments')
        ? Promise.reject(
            new ApiFetchError(423, { code: 'LOCKED', message: 'Someone else has the pen.' }),
          )
        : Promise.resolve([]),
    );
    return expect(
      carriage().carry({
        cloneId: 'clone',
        cloneVersion: 1,
        sourceName: 'Excavate',
        assignments: [assignment()],
        steps: [],
      }),
    ).rejects.toBeInstanceOf(ApiFetchError);
  });

  it('carries the remaining assignments after one is skipped', () => {
    let calls = 0;
    fetchMock.mockImplementation((path: string) => {
      if (!path.endsWith('/assignments')) return Promise.resolve([]);
      calls += 1;
      return calls === 1 ? Promise.reject(archivedResourceError()) : Promise.resolve({});
    });
    return carriage()
      .carry({
        cloneId: 'clone',
        cloneVersion: 1,
        sourceName: 'Excavate',
        assignments: [
          assignment({ resourceId: 'r-retired' }),
          assignment({ resourceId: 'r-live' }),
        ],
        steps: [],
      })
      .then((result) => {
        expect(result.skipped).toHaveLength(1);
        expect(calls).toBe(2);
      });
  });
});
