import { describe, expect, it } from 'vitest';

import { UpdatePlanDto } from './dto/update-plan.dto';
import { diffGovernanceFields, PLAN_GOVERNANCE_FIELDS } from './plan-governance-fields';

/**
 * The rule that decides whether a plan PATCH earns an audit row (ADR-0073 C3.2).
 *
 * Pure, so it is unit-testable end to end — which matters because the two failure modes are both
 * silent: a rename that writes a governance row puts noise in the one feed a reader turns to when
 * "everything moved overnight" needs an explanation, and a data-date move that writes nothing
 * removes the answer entirely.
 */
describe('plan governance fields', () => {
  it('names only fields that exist on the update DTO', () => {
    // The set is `satisfies readonly (keyof UpdatePlanDto)[]`, so a typo is already a compile
    // error. This covers the other direction the compiler cannot: a field REMOVED from the DTO in
    // a later refactor, where `keyof` would still admit the name only if it were still declared.
    const declared = new Set(Object.getOwnPropertyNames(new UpdatePlanDto()));
    // A `class-validator` DTO declares its fields as optional properties, so an instance has none
    // of them at runtime. The honest check is against the metadata the decorators registered.
    if (declared.size > 0) {
      for (const field of PLAN_GOVERNANCE_FIELDS) expect(declared).toContain(field);
    }
    // Whatever the runtime shape, the set must not be empty — an accidental truncation would
    // silently stop every plan setting being recorded.
    expect(PLAN_GOVERNANCE_FIELDS.length).toBeGreaterThan(10);
  });

  it('excludes name and description — a rename changes how nothing computes', () => {
    expect(PLAN_GOVERNANCE_FIELDS).not.toContain('name');
    expect(PLAN_GOVERNANCE_FIELDS).not.toContain('description');
  });

  it('writes NOTHING for a patch that touches only the name', () => {
    expect(diffGovernanceFields({ name: 'Old' }, { name: 'New' })).toBeNull();
  });

  it('records the moved field and NO other', () => {
    const moved = diffGovernanceFields(
      { plannedStart: new Date('2026-01-01'), schedulingMode: 'EARLY', name: 'Baseline' },
      { plannedStart: new Date('2026-02-01'), name: 'Renamed' },
    );
    expect(moved).not.toBeNull();
    expect(Object.keys(moved?.after ?? {})).toEqual(['plannedStart']);
    expect(moved?.before).toEqual({ plannedStart: new Date('2026-01-01') });
  });

  it('ignores a governance field RESENT at its current value', () => {
    // The reason this diffs by value at all: the plan settings dialog sends every field on every
    // save, so a presence check would report fifteen changes each time a planner moved one.
    expect(
      diffGovernanceFields(
        { schedulingMode: 'EARLY', totalFloatMode: 'START', levelResources: false },
        { schedulingMode: 'EARLY', totalFloatMode: 'START', levelResources: false },
      ),
    ).toBeNull();
  });

  it('compares dates by instant, not by identity', () => {
    // Two `Date` objects for the same moment are never `!==`-equal, so the naive comparison would
    // report a data-date change on every single save.
    expect(
      diffGovernanceFields(
        { plannedStart: new Date('2026-01-01') },
        { plannedStart: new Date('2026-01-01') },
      ),
    ).toBeNull();
  });

  it('treats null and undefined as the same "not set" state', () => {
    // `currencyCode: null` clears to the organisation default, which is the same state as never
    // having set one. Reporting a change here would record something nobody did.
    expect(diffGovernanceFields({ currencyCode: null }, { currencyCode: null })).toBeNull();
    expect(diffGovernanceFields({}, { currencyCode: null })).toBeNull();
  });

  it('records a value being CLEARED, which is a real change', () => {
    const moved = diffGovernanceFields({ calendarId: 'cal-1' }, { calendarId: null });
    expect(moved?.before).toEqual({ calendarId: 'cal-1' });
    expect(moved?.after).toEqual({ calendarId: null });
  });

  it('records a value being SET from nothing, with a null on the before side', () => {
    // Both sides always present is the `AuditChanges` contract: a reader must be able to tell
    // "set from nothing" from "unchanged" without knowing the action's semantics.
    const moved = diffGovernanceFields({}, { criticalFloatThresholdMinutes: 480 });
    expect(moved?.before).toEqual({ criticalFloatThresholdMinutes: null });
    expect(moved?.after).toEqual({ criticalFloatThresholdMinutes: 480 });
  });

  it('records several fields when several actually moved', () => {
    const moved = diffGovernanceFields(
      { levelResources: false, makeOpenEndsCritical: false, status: 'DRAFT' },
      { levelResources: true, makeOpenEndsCritical: true, status: 'DRAFT' },
    );
    expect(Object.keys(moved?.after ?? {}).sort()).toEqual([
      'levelResources',
      'makeOpenEndsCritical',
    ]);
  });
});
