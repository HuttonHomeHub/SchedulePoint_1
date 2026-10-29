import { describe, expect, it } from 'vitest';

import {
  CODE_ASSIGNMENT_LIMIT,
  codeAssignedAnnouncement,
  codeAssignmentLabel,
  codeAssignmentStatus,
  planCodeAssignment,
  type AssignableActivity,
} from './code-assignment-plan';

const act = (
  id: string,
  codes: AssignableActivity['codes'] = undefined,
  version = 1,
): AssignableActivity => ({ id, name: `Activity ${id}`, version, codes });

const area = (valueId: string) => [{ codeTypeId: 'area', codeValueId: valueId }];

describe('planCodeAssignment', () => {
  it('sends only the activities whose value would change, and counts the rest as already having it', () => {
    const plan = planCodeAssignment(
      [act('a', area('roof')), act('b', area('gf'), 4), act('c')],
      new Map([['area', 'roof']]),
    );
    expect(plan.rows).toEqual([
      { id: 'b', version: 4, codes: [{ codeTypeId: 'area', codeValueId: 'roof' }] },
      { id: 'c', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'roof' }] },
    ]);
    expect(plan.willChange).toBe(2);
    expect(plan.alreadyHave).toBe(1);
    expect(plan.tooMany).toBe(false);
  });

  it('records both sides of each change, for the undo step', () => {
    const plan = planCodeAssignment([act('b', area('gf'))], new Map([['area', 'roof']]));
    expect(plan.steps).toEqual([
      {
        id: 'b',
        name: 'Activity b',
        changes: [{ codeTypeId: 'area', before: 'gf', after: 'roof' }],
      },
    ]);
  });

  it('clears with null, and reads "no entry" as no value', () => {
    const plan = planCodeAssignment(
      [act('a', area('gf')), act('b', []), act('c')],
      new Map([['area', null]]),
    );
    expect(plan.rows).toEqual([
      { id: 'a', version: 1, codes: [{ codeTypeId: 'area', codeValueId: null }] },
    ]);
    expect(plan.alreadyHave).toBe(2);
  });

  it('leaves a type that is already right out of a row that needs another', () => {
    const plan = planCodeAssignment(
      [
        act('a', [
          { codeTypeId: 'area', codeValueId: 'roof' },
          { codeTypeId: 'trade', codeValueId: 'civ' },
        ]),
      ],
      new Map([
        ['area', 'roof'],
        ['trade', 'mep'],
      ]),
    );
    expect(plan.rows[0]?.codes).toEqual([{ codeTypeId: 'trade', codeValueId: 'mep' }]);
  });

  it('sends nothing for a selection that already holds the target', () => {
    const plan = planCodeAssignment([act('a', area('roof'))], new Map([['area', 'roof']]));
    expect(plan).toMatchObject({ rows: [], steps: [], willChange: 0, alreadyHave: 1 });
  });

  it('refuses above the route’s 2,000 changing rows, and not at 2,000', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => act(`a${String(i)}`));
    const target = new Map([['area', 'roof']]);
    expect(planCodeAssignment(many(CODE_ASSIGNMENT_LIMIT), target).tooMany).toBe(false);
    expect(planCodeAssignment(many(CODE_ASSIGNMENT_LIMIT + 1), target).tooMany).toBe(true);
  });

  it('does not count rows that already match toward the limit', () => {
    const rows = [
      ...Array.from({ length: CODE_ASSIGNMENT_LIMIT }, (_, i) => act(`a${String(i)}`)),
      act('x', area('roof')),
    ];
    expect(planCodeAssignment(rows, new Map([['area', 'roof']])).tooMany).toBe(false);
  });
});

describe('the words', () => {
  it('labels with the concrete names', () => {
    expect(codeAssignmentLabel({ typeNames: ['Area'], activityNames: ['Piling'] })).toBe(
      'Set Area on “Piling”',
    );
    expect(codeAssignmentLabel({ typeNames: ['Area'], activityNames: ['a', 'b', 'c'] })).toBe(
      'Set Area on 3 activities',
    );
    expect(codeAssignmentLabel({ typeNames: ['Area', 'Trade'], activityNames: ['Piling'] })).toBe(
      'Change codes on “Piling”',
    );
  });

  it('says what a press will do, and how many already have it', () => {
    const plan = planCodeAssignment(
      [act('a', area('roof')), act('b'), act('c')],
      new Map([['area', 'roof']]),
    );
    expect(codeAssignmentStatus({ typeName: 'Area', valueName: 'Roof', selected: 3, plan })).toBe(
      'Sets Area to Roof on 2 activities. 1 is already set to it.',
    );
  });

  it('says so when nothing would change', () => {
    const plan = planCodeAssignment([act('a', area('roof'))], new Map([['area', 'roof']]));
    expect(codeAssignmentStatus({ typeName: 'Area', valueName: 'Roof', selected: 1, plan })).toBe(
      'It’s already set to that Area.',
    );
  });

  it('words a clear as a clear', () => {
    const plan = planCodeAssignment([act('a', area('roof')), act('b')], new Map([['area', null]]));
    expect(codeAssignmentStatus({ typeName: 'Area', valueName: null, selected: 2, plan })).toBe(
      'Clears Area on 1 activity. 1 already has no value.',
    );
    expect(codeAssignedAnnouncement({ typeName: 'Area', valueName: null, changed: 1 })).toBe(
      'Cleared Area on 1 activity.',
    );
    expect(codeAssignedAnnouncement({ typeName: 'Area', valueName: 'Roof', changed: 5 })).toBe(
      'Set Area to Roof on 5 activities.',
    );
  });
});
