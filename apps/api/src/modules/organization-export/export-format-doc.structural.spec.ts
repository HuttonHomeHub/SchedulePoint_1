import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const FILES_SECTION = DOC.slice(DOC.indexOf('\n## Files\n'), DOC.indexOf('\n## Excluded tables\n'));
const EXCLUDED_SECTION = DOC.slice(DOC.indexOf('\n## Excluded tables\n'));

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
      expect(section).toContain(`Table \`${file.table}\``);
      expect(section).toContain(`\`json/${file.file}.json\``);
      expect(section).toContain(`\`csv/${file.file}.csv\``);

      const rows = [...section.matchAll(/^\| `(\w+)`\s+\| (\w+)\s+\|$/gm)].map((m) => [m[1], m[2]]);
      expect(rows).toEqual(file.columns.map((c) => [c.field, c.kind]));

      const withheld = /Not exported: (.+)\.$/m.exec(section)?.[1];
      const named = withheld ? [...withheld.matchAll(/`(\w+)`/g)].map((m) => m[1]) : [];
      expect(named).toEqual(Object.keys(file.withheld));
    },
  );

  it('lists exactly the excluded tables', () => {
    const named = [...EXCLUDED_SECTION.matchAll(/^\| `(\w+)`\s+\|/gm)].map((m) => m[1]);
    expect(named).toEqual(EXCLUDED_MODELS.map((m) => m.table));
  });
});
