import { describe, expect, it } from 'vitest';

import { historyPhrase } from './history-phrase';

describe('historyPhrase', () => {
  it('lower-cases the label’s first letter only, keeping the activity name’s own capitals', () => {
    expect(historyPhrase('Undo', 'Edit “Excavate”')).toBe('Undo edit “Excavate”');
    expect(historyPhrase('Redid', 'Move “NORTH Wing”')).toBe('Redid move “NORTH Wing”');
  });

  it('falls back to the bare verb when there is no label', () => {
    expect(historyPhrase('Undo', null)).toBe('Undo');
    expect(historyPhrase('Redo', undefined)).toBe('Redo');
    expect(historyPhrase('Redo', '')).toBe('Redo');
  });

  it('is unmoved by typographic quotes inside the name', () => {
    expect(historyPhrase('Undid', 'Delete “The “Big” Dig”')).toBe('Undid delete “The “Big” Dig”');
  });
});
