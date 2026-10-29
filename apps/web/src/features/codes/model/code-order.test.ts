import { describe, expect, it } from 'vitest';

import { movedRow, orderBody } from './code-order';

const rows = [
  { id: 'a', version: 1 },
  { id: 'b', version: 4 },
  { id: 'c', version: 2 },
];

describe('movedRow', () => {
  it('moves a row one place either way', () => {
    expect(movedRow(rows, 'b', -1)?.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(movedRow(rows, 'b', 1)?.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('answers null at either end, and for a row that is not in the list', () => {
    expect(movedRow(rows, 'a', -1)).toBeNull();
    expect(movedRow(rows, 'c', 1)).toBeNull();
    expect(movedRow(rows, 'zzz', 1)).toBeNull();
  });

  it('does not touch the list it was given', () => {
    movedRow(rows, 'b', -1);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('orderBody', () => {
  it('names every row once with the version it was read at, and nothing else', () => {
    const withExtras = [{ id: 'a', version: 1, name: 'extra' }, rows[1]!];
    expect(orderBody(withExtras)).toEqual([
      { id: 'a', version: 1 },
      { id: 'b', version: 4 },
    ]);
  });
});
