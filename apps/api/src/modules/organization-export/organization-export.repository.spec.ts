import { describe, expect, it } from 'vitest';

import { EXPORT_FILES } from './export-columns';
import { EXPORT_STRATEGY, selectOf } from './organization-export.repository';

describe('the export repository, against the registry', () => {
  it('reads every registry file one way, and the same way the registry says', () => {
    expect(Object.keys(EXPORT_STRATEGY).sort()).toEqual(EXPORT_FILES.map((f) => f.model).sort());
    for (const file of EXPORT_FILES) {
      expect(EXPORT_STRATEGY[file.model]!.read, file.file).toBe(file.read);
    }
  });

  it('names a parent for every by-parent file and for no other', () => {
    for (const file of EXPORT_FILES) {
      const parent = EXPORT_STRATEGY[file.model]!.parent;
      expect(parent !== undefined, file.file).toBe(file.read === 'by-parent');
    }
  });

  it('can page every file: each has an id column to keyset on', () => {
    for (const file of EXPORT_FILES) {
      expect(
        file.columns.some((c) => c.field === 'id' && (c.source ?? 'id') === 'id'),
        file.file,
      ).toBe(true);
    }
  });

  it('selects exactly the registry columns and never a withheld one', () => {
    for (const file of EXPORT_FILES) {
      const selected = Object.keys(selectOf(file));
      expect(selected.sort(), file.file).toEqual(
        file.columns.map((c) => c.source ?? c.field).sort(),
      );
      for (const withheld of Object.keys(file.withheld)) {
        expect(selected, `${file.file}.${withheld}`).not.toContain(withheld);
      }
    }
  });
});
