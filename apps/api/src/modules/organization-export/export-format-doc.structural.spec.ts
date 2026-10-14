import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  EXCLUDED_MODELS,
  EXPORT_FILES,
  EXPORT_FORMAT_NAME,
  EXPORT_FORMAT_VERSION,
} from './export-columns';

/**
 * `docs/ORGANISATION_EXPORT_FORMAT.md` is the promised contract and `export-columns.ts` is its code
 * form, so the two are compared rather than trusted (ADR-0076: a computable claim is computed).
 * Each file has a `### \`name\`` section under "## Files"; its table must list exactly the registry's
 * columns, in order, with their types, and name exactly the registry's withheld fields.
 */
const DOC = readFileSync(
  join(__dirname, '../../../../../docs/ORGANISATION_EXPORT_FORMAT.md'),
  'utf8',
);

const FILES_SECTION = DOC.slice(
  DOC.indexOf('\n## Files\n'),
  DOC.indexOf('\n## Excluded record types\n'),
);
const EXCLUDED_SECTION = DOC.slice(DOC.indexOf('\n## Excluded record types\n'));

function sections(): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of FILES_SECTION.split(/\n### /).slice(1)) {
    const name = /^`([^`]+)`/.exec(part)?.[1];
    if (name) out.set(name, part);
  }
  return out;
}

describe('the organisation export format document', () => {
  it('states the registry’s format name and version', () => {
    expect(DOC).toContain(`\`${EXPORT_FORMAT_NAME}\``);
    expect(DOC).toContain(`**Version:** \`${EXPORT_FORMAT_VERSION}\``);
  });

  it('has a section for exactly the registry’s files, in order', () => {
    expect(FILES_SECTION.length).toBeGreaterThan(1000);
    expect([...sections().keys()]).toEqual(EXPORT_FILES.map((f) => f.file));
  });

  it.each(EXPORT_FILES.map((f) => [f.file, f] as const))(
    'lists %s’s columns, types and withheld fields exactly',
    (name, file) => {
      const section = sections().get(name) ?? '';
      expect(section).toContain(`\`json/${file.file}.json\``);
      expect(section).toContain(`\`csv/${file.file}.csv\``);

      const rows = [...section.matchAll(/^\| `(\w+)`\s+\| (\w+)\s+\| (.*?)\s*\|$/gm)];
      expect(rows.map((m) => [m[1], m[2]])).toEqual(file.columns.map((c) => [c.field, c.kind]));

      // The unit is stated for every column that has one, and a finish date says it is inclusive.
      for (const [, field = '', kind = '', note = ''] of rows) {
        if (/Minutes$/.test(field)) expect(note).toMatch(/^minutes/);
        if (/Days$/.test(field)) expect(note).toBe('days');
        if (kind === 'date' && (/Finish$/.test(field) || field === 'endDate')) {
          expect(note).toBe('inclusive last day');
        }
      }

      expect(section.includes('Informational:')).toBe(file.stability === 'informational');

      const withheld = /Not exported: (.+)\.$/m.exec(section)?.[1];
      const named = withheld ? [...withheld.matchAll(/`(\w+)`/g)].map((m) => m[1]) : [];
      expect(named).toEqual(Object.keys(file.withheld));
    },
  );

  it('lists exactly the excluded record types, by their human names', () => {
    const named = [...EXCLUDED_SECTION.matchAll(/^\| ([^|]+?)\s+\| (?!-)/gm)]
      .map((m) => m[1])
      .filter((name) => name !== 'Record type');
    expect(named).toEqual(EXCLUDED_MODELS.map((m) => m.label));
  });

  it('puts no database table name in the promised format', () => {
    const tables = [...EXPORT_FILES, ...EXCLUDED_MODELS]
      .map((x) => x.table)
      .filter((table) => table.includes('_'));
    for (const table of tables) expect(DOC).not.toContain(table);
    expect(DOC).not.toMatch(/^Table `/m);
  });

  it('lists every enum column by file.column, with its current values', () => {
    const { models, enums } = Prisma.dmmf.datamodel;
    const expected = new Map<string, string[]>();
    for (const file of EXPORT_FILES) {
      const model = models.find((m) => m.name === file.model);
      for (const column of file.columns.filter((c) => c.kind === 'enum')) {
        const type = model?.fields.find((f) => f.name === (column.source ?? column.field))?.type;
        expected.set(
          `${file.file}.${column.field}`,
          enums.find((e) => e.name === type)?.values.map((v) => v.name) ?? [],
        );
      }
    }
    const listed = new Map(
      [...DOC.matchAll(/^- `([\w-]+\.\w+)`: ([A-Z_0-9, ]+)$/gm)].map((m) => [
        m[1],
        (m[2] ?? '').split(', '),
      ]),
    );
    expect(expected.size).toBeGreaterThan(30);
    expect([...listed.keys()]).toEqual([...expected.keys()]);
    for (const [key, values] of expected) expect(listed.get(key)).toEqual(values);
  });

  it('states the conventions a reader cannot infer', () => {
    const rowNote = (file: string, column: string): string =>
      new RegExp(`^\\| \`${column}\`\\s+\\| \\w+\\s+\\| (.*?)\\s*\\|$`, 'm').exec(
        sections().get(file) ?? '',
      )?.[1] ?? '';
    expect(rowNote('calendar-shifts', 'weekday')).toBe('Monday = 0 … Sunday = 6');
    expect(rowNote('activities', 'percentComplete')).toBe('whole percent, 0 to 100');
    expect(rowNote('activities', 'physicalPercentComplete')).toBe('whole percent, 0 to 100');
    expect(rowNote('activities', 'laneIndex')).toContain('0 is the first row');
    expect(rowNote('activities', 'levelingPriority')).toContain('lower number = higher priority');
    expect(rowNote('activity-steps', 'seq')).toContain('1 upwards');
    expect(rowNote('calendars', 'workdayMinutes')).toContain('minutes');
    for (const column of ['action', 'subjectType']) {
      expect(rowNote('audit-events', column)).toContain('open set');
    }
    expect(DOC).toContain('compare the major of `formatVersion` only');
    expect(DOC).toContain('not a property of\n  the format');
    expect(DOC).toContain('Order carries no meaning and is not promised');
    expect(DOC).not.toMatch(/deterministic|creation order/);
  });
});
