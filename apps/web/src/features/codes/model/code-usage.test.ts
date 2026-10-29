import { describe, expect, it } from 'vitest';

import {
  codeUsage,
  typeDeleteSentence,
  typeDeleteTitle,
  valueDeleteSentence,
  valueDeleteTitle,
} from './code-usage';

const entry = (codeTypeId: string, codeValueId: string) => ({ codeTypeId, codeValueId });

describe('codeUsage', () => {
  it('counts carriers per value and per type, from the activities in memory', () => {
    const usage = codeUsage([
      { codes: [entry('area', 'l1'), entry('trade', 'mep')] },
      { codes: [entry('area', 'l1')] },
      { codes: [entry('area', 'gf')] },
      { codes: [] },
      {},
    ]);
    expect(usage.byValue.get('l1')).toBe(2);
    expect(usage.byValue.get('gf')).toBe(1);
    expect(usage.byValue.get('l2')).toBeUndefined();
    expect(usage.byType.get('area')).toBe(3);
    expect(usage.byType.get('trade')).toBe(1);
  });
});

describe('the delete sentences', () => {
  it('say how many use a value and what they show, in the singular and the plural', () => {
    expect(valueDeleteTitle('L1')).toBe('Delete L1?');
    expect(valueDeleteSentence(3, 'Area')).toBe(
      '3 activities use it. They will show no Area until you restore it.',
    );
    expect(valueDeleteSentence(1, 'Area')).toBe(
      '1 activity uses it. It will show no Area until you restore it.',
    );
    expect(valueDeleteSentence(0, 'Area')).toBe(
      'No activities use it. You can restore it from Deleted values.',
    );
  });

  it('claim no count while the activities are still loading', () => {
    const sentence = valueDeleteSentence(undefined, 'Area');
    expect(sentence).toBe('Activities that use it will show no Area until you restore it.');
    expect(sentence).not.toMatch(/\bNo activities\b/);
  });

  it('count a type’s values in the title and say what its removal shows', () => {
    expect(typeDeleteTitle('Area', 4)).toBe('Delete Area and its 4 values?');
    expect(typeDeleteTitle('Area', 1)).toBe('Delete Area and its 1 value?');
    expect(typeDeleteTitle('Area', 0)).toBe('Delete Area?');
    expect(typeDeleteSentence('Area')).toBe(
      'Activities that use Area will show no Area until you restore it. You can do that from Deleted code types.',
    );
  });
});
