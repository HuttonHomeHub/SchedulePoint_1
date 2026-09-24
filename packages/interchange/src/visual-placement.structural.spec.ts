import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **ONE producer for the hand-placement drop, never a copy in each serialiser**
 * (one-planning-surface M-G).
 *
 * The finding is raised once, in `export-mapper.ts`, from the export graph. The tempting shape is a
 * per-format one — XER knows its own tables, MSPDI knows its own elements — and it is the shape
 * ADR-0065 records as the expensive mistake: two implementations drift, and **the drift is
 * invisible**, because each looks right alone and only somebody who exported the same placed
 * programme in both formats and compared the two reports would ever see one.
 *
 * So this asserts the negative, which no unit test of either serialiser can: that neither emitter
 * so much as **mentions** the field. A serialiser that read `visualStart` would either write it
 * (inventing a column name this repository has never verified) or report it a second time.
 *
 * **It matches the field name precisely and not a substring like `lag` or `visual`.** Both emitters
 * legitimately read `relationship.lagMinutes` — the dependency lag, an entirely different field
 * that IS written — so a loose pattern here would fail against correct code, and a gate that does
 * that gets weakened rather than fixed (ADR-0058).
 */

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

describe('the hand-placement drop has one producer', () => {
  it.each([
    'export-xer.ts',
    'xer-emit.ts',
    'export-mspdi.ts',
    'mspdi-emit.ts',
    'mspdi-serialiser.ts',
    'xer-serialiser.ts',
  ])('%s never reads visualStart', (file) => {
    expect(read(file)).not.toMatch(/\bvisualStart\b/);
  });

  /**
   * **The pinned positive**, and it is not decoration: every assertion above is satisfied by a
   * repository in which the feature does not exist at all, so a green run must not be able to mean
   * "the finding is gone" (ADR-0093's shape). This is the one file that must mention it.
   */
  it('export-mapper.ts is the one file that does', () => {
    expect(read('export-mapper.ts')).toMatch(/\bvisualStart\b/);
  });
});

/**
 * **ONE module names the layout fields** (layout-interchange, spec §4.6 items 2–3; the reader half,
 * M2 — M3 adds the emitter's import to the positive list).
 *
 * The labels are the file format's identity for the two fields, so a second copy of one is a second
 * definition of the format: change one and a SchedulePoint file stops restoring, with every unit test
 * of the module that changed still green. The same argument keeps MSPDI out of it entirely until the
 * deferred MSPDI milestone edits this assertion on purpose.
 */
describe('the layout fields have one home', () => {
  const LABEL = /SchedulePoint layout v\d+:/;
  const production = readdirSync(fileURLToPath(new URL('.', import.meta.url))).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.includes('.fixtures.'),
  );

  it('no production file but xer-layout-fields.ts contains a layout label', () => {
    const offenders = production.filter(
      (name) => name !== 'xer-layout-fields.ts' && LABEL.test(read(name)),
    );
    expect(offenders).toEqual([]);
  });

  it('the XER adapter reads through it', () => {
    expect(read('xer-adapter.ts')).toMatch(/from '\.\/xer-layout-fields\.js'/);
  });

  it.each(['mspdi-emit.ts', 'mspdi-serialiser.ts', 'export-mspdi.ts', 'mspdi-adapter.ts'])(
    '%s mentions neither the fields nor a layout',
    (file) => {
      const text = read(file);
      expect(text).not.toMatch(/xer-layout-fields|\blayout\b/);
    },
  );

  /** The pinned positive (ADR-0093): every assertion above passes against a repository without the feature. */
  it('xer-layout-fields.ts does contain both labels', () => {
    const text = read('xer-layout-fields.ts');
    expect(text).toContain("'SchedulePoint layout v1: placed start'");
    expect(text).toContain("'SchedulePoint layout v1: row'");
    expect(production).toContain('xer-layout-fields.ts');
  });
});
