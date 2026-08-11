import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateActivity,
  useUpdateActivity,
  type ActivityDefinitionInput,
} from './use-activities';

import { apiFetch } from '@/lib/api/client';

/**
 * **The create/update asymmetry, as an assertion.**
 *
 * A blank optional field means two different things on the two verbs, and both are deliberate:
 *
 * - `createBody` **omits** the key, so the API's own default applies. A `null` here would be the
 *   client asserting "no calendar", which is not what an untouched picker said.
 * - `updateBody` **sends `null`**, so a field the planner cleared is actually cleared. An omitted
 *   key on a PATCH leaves the stored value alone, which is how a cleared constraint silently
 *   survives its own removal.
 *
 * ## Why this file exists rather than one more case in the schema suite
 *
 * `schemas/activity-scope-schemas.structural.test.ts` computes the four scope shapes against
 * `activityFormSchema`'s keys, in both directions. That is the right gate today, and it stops being
 * one at **M6**: when `activityFormSchema` retires, the scope schemas become the only definition of
 * the field set, and that test compares them against the field groups — both edited by the same
 * change. A field could then stop being validated *and* stop being rendered with both halves green,
 * because the pair would agree with each other about a field neither of them has.
 *
 * These builders are **external to that pair**. They are the wire contract, they name every field
 * independently of any schema, and nothing about a scope refactor touches them — so from M6 they
 * are the anchor the schema suite can no longer be. Do not fold this file into that one.
 *
 * ## Method
 *
 * `createBody` / `updateBody` are module-private, so they are driven through their mutations with
 * `apiFetch` mocked and the request body read back — the idiom `CalendarFormDialog.shifts.test.tsx`
 * uses (`sentBody`). Testing them through the hook is also the honest boundary: the body a caller
 * can actually cause is the thing M6 must not change.
 */

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

/**
 * Every optional field blank — the form as it stands when a planner fills in nothing but the name.
 *
 * `durationDays` is set explicitly so the duration fragment is decided without a working-hours
 * factor: this file is about blank-vs-null, and routing the day↔minute conversion through it would
 * make the assertions depend on ADR-0070's factor resolution as well.
 */
const BLANK: ActivityDefinitionInput = {
  name: 'Excavate',
  code: '',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  duration: '3',
  durationDays: 3,
  constraintType: '',
  constraintDate: '',
  secondaryConstraintType: '',
  secondaryConstraintDate: '',
  scheduleAsLateAsPossible: false,
  expectedFinish: '',
  externalEarlyStart: '',
  externalLateFinish: '',
  calendarId: '',
  parentId: '',
  levelingPriority: undefined,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  physicalPercentComplete: undefined,
  budgetedExpense: undefined,
  actualExpense: undefined,
  description: '',
};

/**
 * The optional fields whose blank state the two verbs disagree about. `scheduleAsLateAsPossible` is
 * deliberately absent: it is a boolean, so its blank state is `false` and not "unset" — the
 * asymmetry below does not apply to it, and it is asserted separately.
 */
const CLEARABLE_KEYS = [
  'code',
  'description',
  'constraintType',
  'constraintDate',
  'secondaryConstraintType',
  'secondaryConstraintDate',
  'expectedFinish',
  'externalEarlyStart',
  'externalLateFinish',
  'calendarId',
  'parentId',
  'levelingPriority',
  'physicalPercentComplete',
  'budgetedExpense',
  'actualExpense',
] as const;

async function createdBody(
  input: ActivityDefinitionInput = BLANK,
): Promise<Record<string, unknown>> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useCreateActivity('acme', 'p1'), { wrapper: wrapper(qc) });
  await result.current.mutateAsync(input);
  return sentBody();
}

async function updatedBody(
  input: ActivityDefinitionInput = BLANK,
): Promise<Record<string, unknown>> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useUpdateActivity('acme', 'p1'), { wrapper: wrapper(qc) });
  await result.current.mutateAsync({ activityId: 'a1', version: 7, ...input });
  return sentBody();
}

function sentBody(): Record<string, unknown> {
  const call = vi.mocked(apiFetch).mock.calls.at(-1);
  return JSON.parse((call?.[1] as { body: string }).body) as Record<string, unknown>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset().mockResolvedValue({});
});

describe('the activity write bodies — a blank optional field', () => {
  it('is left out of a create, so the API’s own default applies', async () => {
    const body = await createdBody();
    for (const key of CLEARABLE_KEYS) expect(body).not.toHaveProperty(key);
  });

  it('is sent as null on an update, so clearing a field actually clears it', async () => {
    const body = await updatedBody();
    for (const key of CLEARABLE_KEYS) expect(body[key]).toBeNull();
  });

  it('is absent from the create body for exactly the keys the update body nulls', async () => {
    // The asymmetry as one computed statement rather than two lists that could drift apart: every
    // key an update clears is a key a create declines to state.
    const created = await createdBody();
    const updated = await updatedBody();
    const nulled = Object.keys(updated).filter((key) => updated[key] === null);
    expect([...nulled].sort()).toEqual([...CLEARABLE_KEYS].sort());
    for (const key of nulled) expect(created).not.toHaveProperty(key);
  });

  it('keeps a false as a false on an update — a boolean has no unset state', async () => {
    expect((await updatedBody()).scheduleAsLateAsPossible).toBe(false);
    // …and a create still says nothing at all, so the API default stands.
    expect(await createdBody()).not.toHaveProperty('scheduleAsLateAsPossible');
  });
});

describe('the activity write bodies — the fields both verbs always state', () => {
  /**
   * The enum attributes whose form default equals the API default. They are sent unconditionally on
   * both verbs so a hidden picker (a flag off, a scope not shown) round-trips the stored value
   * rather than resetting it — the reason each carries a docblock in `use-activities.ts`.
   */
  const ALWAYS = ['name', 'type', 'durationType', 'percentCompleteType', 'accrualType'] as const;

  it('states them on a create', async () => {
    const body = await createdBody();
    for (const key of ALWAYS) expect(body).toHaveProperty(key);
  });

  it('states them on an update', async () => {
    const body = await updatedBody();
    for (const key of ALWAYS) expect(body).toHaveProperty(key);
  });

  it('sends a set optional value on both verbs, so the tests above pin blankness and not the key', async () => {
    // Without this, every assertion above would still pass on a builder that had simply stopped
    // sending these fields at all — the "assert the unsqueezed control too" rule.
    const filled: ActivityDefinitionInput = {
      ...BLANK,
      code: 'A100',
      calendarId: 'cal-8',
      parentId: 'sum-1',
      levelingPriority: 5,
      description: 'Dig it',
    };
    for (const body of [await createdBody(filled), await updatedBody(filled)]) {
      expect(body).toMatchObject({
        code: 'A100',
        calendarId: 'cal-8',
        parentId: 'sum-1',
        levelingPriority: 5,
        description: 'Dig it',
      });
    }
  });
});
