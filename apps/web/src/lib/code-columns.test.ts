import { describe, expect, it } from 'vitest';

import {
  CODE_CELL_LOADING,
  CODE_CELL_UNAVAILABLE,
  CodeColumnsUnavailableError,
  codeCellText,
  codeColumnsPrintRefusal,
  codeColumnsUnavailableSentence,
  MAX_CODE_COLUMNS,
  parseCodeColumnIds,
  resolveCodeColumnIds,
  serialiseCodeColumnIds,
  type CodeColumn,
} from './code-columns';

import { anActivity } from '@/test/activity-fixture';

const column = (over: Partial<CodeColumn> = {}): CodeColumn => ({
  key: 'area',
  label: 'Area',
  status: 'ready',
  text: () => 'Ground floor',
  ...over,
});

describe('the code columns in the URL', () => {
  it('reads a comma-separated list of ids', () => {
    expect(parseCodeColumnIds('area,trade')).toEqual(['area', 'trade']);
  });

  it('reads an absent, empty or unreadable value as none shown, which is also the default', () => {
    expect(parseCodeColumnIds(undefined)).toEqual([]);
    expect(parseCodeColumnIds('')).toEqual([]);
    expect(parseCodeColumnIds(',,')).toEqual([]);
    expect(parseCodeColumnIds({ nested: 'object' })).toEqual([]);
    expect(parseCodeColumnIds('a b,<script>,%%,area')).toEqual(['area']);
  });

  it('reads a number the router’s codec already coerced (ADR-0123) as the string it was', () => {
    expect(parseCodeColumnIds(12345)).toEqual(['12345']);
  });

  it('collapses a repeated id', () => {
    expect(parseCodeColumnIds('area,area, area')).toEqual(['area']);
  });

  it('drops the id of a type that no longer exists, and keeps type order', () => {
    expect(resolveCodeColumnIds(['trade', 'gone', 'area'], ['area', 'trade', 'phase'])).toEqual([
      'area',
      'trade',
    ]);
  });

  it('trims a list over the cap, keeping the first ten in type order', () => {
    const types = Array.from({ length: 14 }, (_, i) => `t${String(i)}`);
    expect(resolveCodeColumnIds([...types].reverse(), types)).toEqual(
      types.slice(0, MAX_CODE_COLUMNS),
    );
  });

  it('writes the same view as the same URL whatever order it was chosen in', () => {
    const types = ['area', 'trade', 'phase'];
    expect(serialiseCodeColumnIds(['phase', 'area'], types)).toBe('area,phase');
    expect(serialiseCodeColumnIds([], types)).toBe('');
  });
});

describe('what a code cell says', () => {
  it('reads the value’s name once the values are here', () => {
    expect(codeCellText(column(), anActivity())).toBe('Ground floor');
  });

  it('says Loading… while the type’s values load, and Unavailable if they could not be', () => {
    expect(codeCellText(column({ status: 'loading' }), anActivity())).toBe(CODE_CELL_LOADING);
    expect(codeCellText(column({ status: 'error' }), anActivity())).toBe(CODE_CELL_UNAVAILABLE);
  });

  it('puts one sentence over a grid whose columns could not be read, and none otherwise', () => {
    expect(codeColumnsUnavailableSentence([column()])).toBeNull();
    expect(codeColumnsUnavailableSentence([column({ status: 'error' })])).toBe(
      'Area’s values could not be loaded.',
    );
    expect(
      codeColumnsUnavailableSentence([
        column({ status: 'error' }),
        column({ key: 'trade', label: 'Trade', status: 'error' }),
        column({ key: 'phase', label: 'Phase' }),
      ]),
    ).toBe('Values for Area and Trade could not be loaded.');
  });

  it('refuses a printout in one sentence naming the types', () => {
    expect(codeColumnsPrintRefusal(['Area'])).toBe(
      'The printout was not made: Area’s values could not be loaded. Try again.',
    );
    expect(new CodeColumnsUnavailableError(['Area', 'Trade']).message).toBe(
      'The printout was not made: The values of Area, Trade could not be loaded. Try again.',
    );
  });
});
