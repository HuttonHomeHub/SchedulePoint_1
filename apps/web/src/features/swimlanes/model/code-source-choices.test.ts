import type { ActivitySummary, CodeTypeSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { codeSourceChoices, resolveCodeChoice, type CodeSourceChoice } from './code-source-choices';

import { anActivity } from '@/test/activity-fixture';
import { aType } from '@/test/codes-server';

const TYPES: CodeTypeSummary[] = [aType('area', 'Area', 0), aType('trade', 'Trade', 1)];
const carrying = (id: string, typeId: string, valueId: string, type = 'TASK'): ActivitySummary =>
  anActivity({
    id,
    type: type as ActivitySummary['type'],
    codes: [{ codeTypeId: typeId, codeValueId: valueId }],
  });

describe('codeSourceChoices', () => {
  it('counts the distinct values live activities carry, per type, in type order', () => {
    const choices = codeSourceChoices(TYPES, [
      carrying('a', 'area', 'gf'),
      carrying('b', 'area', 'gf'),
      carrying('c', 'area', 'l1'),
      carrying('d', 'trade', 'civ'),
    ]);
    expect(choices.map((c) => [c.id, c.valuesInUse, c.reason])).toEqual([
      ['area', 2, null],
      ['trade', 1, null],
    ]);
  });

  it('does not count a value only a WBS summary carries, so web and server agree', () => {
    const [area] = codeSourceChoices(TYPES, [
      carrying('s', 'area', 'gf', 'WBS_SUMMARY'),
      carrying('a', 'area', 'l1'),
    ]);
    expect(area?.valuesInUse).toBe(1);
    const [none] = codeSourceChoices(TYPES, [carrying('s', 'area', 'gf', 'WBS_SUMMARY')]);
    expect(none).toMatchObject({ valuesInUse: 0 });
    expect(none?.reason).toBe(
      'No activity carries a value of Area yet. Set Area on some activities first.',
    );
  });

  it('refuses a type with more values in use than swimlanes can show, at 101 and not at 100', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => carrying(`r${String(i)}`, 'area', `v${String(i)}`));
    expect(codeSourceChoices(TYPES, rows(100))[0]?.reason).toBeNull();
    expect(codeSourceChoices(TYPES, rows(101))[0]?.reason).toBe(
      'Area has 101 values in use. Swimlanes can show up to 100.',
    );
  });
});

describe('resolveCodeChoice', () => {
  const choice = (id: string, reason: string | null): CodeSourceChoice => ({
    id,
    name: id,
    valuesInUse: reason === null ? 2 : 0,
    reason,
  });
  const list = [choice('a', 'none'), choice('b', null), choice('c', null)];

  it('takes the first that can be chosen when nothing was picked', () => {
    expect(resolveCodeChoice(list, null, null)).toBe('b');
  });

  it('keeps a pick that can be chosen, and drops one that cannot', () => {
    expect(resolveCodeChoice(list, 'c', null)).toBe('c');
    expect(resolveCodeChoice(list, 'a', null)).toBe('b');
  });

  it('holds the plan’s own type even when it is shaded, ahead of the first that can be chosen', () => {
    expect(resolveCodeChoice(list, null, 'a')).toBe('a');
  });

  it('is none when nothing can be chosen', () => {
    expect(resolveCodeChoice([choice('a', 'none')], null, null)).toBeNull();
  });
});
