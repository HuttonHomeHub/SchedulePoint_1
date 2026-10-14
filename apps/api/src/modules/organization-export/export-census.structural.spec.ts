import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  EXCLUDED_MODELS,
  EXPORT_FILES,
  type ColumnKind,
  type ExcludedModel,
  type ExportFile,
} from './export-columns';

/**
 * **The census: the build fails when the schema gains a model or a column nobody decided about**
 * (ADR-0194 D1). The organisation export is a promised format, so "we forgot the new table" would
 * silently ship an incomplete copy of somebody's data — or, worse, a new credential column would be
 * exported by default. The Prisma DMMF is asked, not a literal: a literal list is blind to the one
 * thing this exists to catch, a MISSING entry (the hierarchy-expiry census is the precedent).
 *
 * `censusProblems` is a function so a negative control can hand it a broken registry and watch it
 * object (ADR-0110: a gate is verified against the defect it names). Without that, a census that
 * reads an empty DMMF would pass for ever.
 */
interface DmmfField {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
}
interface DmmfModel {
  readonly name: string;
  readonly dbName?: string | null;
  readonly fields: readonly DmmfField[];
}

const SCHEMA = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

/** `Model.field` for every `@db.Date` column: the DMMF cannot tell a calendar day from an instant. */
function schemaDateFields(): Set<string> {
  const out = new Set<string>();
  for (const [, model, body] of SCHEMA.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    for (const line of (body ?? '').split('\n')) {
      const match = /^\s+(\w+)\s+DateTime\??\s.*@db\.Date\b/.exec(line);
      if (match) out.add(`${model}.${match[1]}`);
    }
  }
  return out;
}

const SCALAR_KIND: Readonly<Record<string, ColumnKind[]>> = {
  String: ['text'],
  Int: ['int'],
  Boolean: ['boolean'],
  BigInt: ['bigint'],
  Decimal: ['decimal'],
  Json: ['json'],
};

function censusProblems(
  models: readonly DmmfModel[],
  files: readonly ExportFile[],
  excluded: readonly ExcludedModel[],
  dateFields: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const included = new Map(files.map((f) => [f.model, f]));
  const out = new Map(excluded.map((e) => [e.model, e]));

  for (const model of models) {
    const file = included.get(model.name);
    const skipped = out.get(model.name);
    if (!file && !skipped) problems.push(`${model.name}: neither exported nor excluded`);
    if (file && skipped) problems.push(`${model.name}: both exported and excluded`);
    if (skipped && !skipped.reason.trim())
      problems.push(`${model.name}: excluded without a reason`);
    if (!file) continue;

    if (file.table !== model.dbName) problems.push(`${model.name}: table is ${model.dbName}`);
    const scalars = model.fields.filter((f) => f.kind !== 'object');
    const byName = new Map(scalars.map((f) => [f.name, f]));
    const columnNames = new Set(file.columns.map((c) => c.field));

    for (const field of scalars) {
      const isColumn = columnNames.has(field.name);
      const reason = file.withheld[field.name];
      if (!isColumn && reason === undefined) {
        problems.push(`${model.name}.${field.name}: neither exported nor withheld`);
      }
      if (isColumn && reason !== undefined) {
        problems.push(`${model.name}.${field.name}: both exported and withheld`);
      }
      if (reason !== undefined && !reason.trim()) {
        problems.push(`${model.name}.${field.name}: withheld without a reason`);
      }
    }
    for (const name of Object.keys(file.withheld)) {
      if (!byName.has(name)) problems.push(`${model.name}.${name}: withheld but not a field`);
    }
    if (columnNames.size !== file.columns.length) problems.push(`${model.name}: duplicate column`);
    for (const column of file.columns) {
      const field = byName.get(column.field);
      if (!field) {
        problems.push(`${model.name}.${column.field}: exported but not a field`);
        continue;
      }
      const wanted =
        field.kind === 'enum'
          ? ['enum']
          : field.type === 'DateTime'
            ? [dateFields.has(`${model.name}.${field.name}`) ? 'date' : 'instant']
            : (SCALAR_KIND[field.type] ?? []);
      if (!wanted.includes(column.kind)) {
        problems.push(
          `${model.name}.${column.field}: kind ${column.kind}, schema says ${wanted.join('|')}`,
        );
      }
    }
  }

  const known = new Set(models.map((m) => m.name));
  for (const name of [...included.keys(), ...out.keys()]) {
    if (!known.has(name)) problems.push(`${name}: in the registry but not in the schema`);
  }
  return problems;
}

describe('the organisation export census', () => {
  const models = Prisma.dmmf.datamodel.models as readonly DmmfModel[];

  it('reads the whole schema, not an empty or partial one', () => {
    const declared = [...SCHEMA.matchAll(/^model \w+ \{/gm)].length;
    expect(models.length).toBe(declared);
    expect(models.length).toBeGreaterThan(30);
  });

  it('has a decision for every model and every column', () => {
    expect(censusProblems(models, EXPORT_FILES, EXCLUDED_MODELS, schemaDateFields())).toEqual([]);
  });

  it('accounts for every model exactly once: 28 exported + 7 excluded', () => {
    expect(EXPORT_FILES).toHaveLength(28);
    expect(EXCLUDED_MODELS).toHaveLength(7);
    expect(EXPORT_FILES.length + EXCLUDED_MODELS.length).toBe(models.length);
  });

  it('gives every file a unique path', () => {
    expect(new Set(EXPORT_FILES.map((f) => f.file)).size).toBe(EXPORT_FILES.length);
  });

  it('never exports a credential or a network address', () => {
    const forbidden = /token|password|secret|ipAddress|userAgent|hash/i;
    const offenders = EXPORT_FILES.flatMap((f) =>
      f.columns.filter((c) => forbidden.test(c.field)).map((c) => `${f.model}.${c.field}`),
    );
    expect(offenders).toEqual([]);
  });

  it('exports only the screen’s fields of a person', () => {
    const people = EXPORT_FILES.find((f) => f.model === 'User');
    expect(people?.columns.map((c) => c.field)).toEqual(['id', 'name', 'email', 'createdAt']);
  });

  describe('negative controls: it can fail', () => {
    const dates = schemaDateFields();
    const first = EXPORT_FILES[0] as ExportFile;

    it('objects to a column the schema gained and the registry did not', () => {
      const withNew = models.map((m) =>
        m.name === 'User'
          ? {
              ...m,
              fields: [...m.fields, { name: 'passwordHint', kind: 'scalar', type: 'String' }],
            }
          : m,
      );
      expect(censusProblems(withNew, EXPORT_FILES, EXCLUDED_MODELS, dates)).toEqual([
        'User.passwordHint: neither exported nor withheld',
      ]);
    });

    it('objects to a model the schema gained', () => {
      const withNew = [...models, { name: 'Widget', dbName: 'widgets', fields: [] }];
      expect(censusProblems(withNew, EXPORT_FILES, EXCLUDED_MODELS, dates)).toEqual([
        'Widget: neither exported nor excluded',
      ]);
    });

    it('objects to a registry column the schema no longer has', () => {
      const stale: ExportFile = {
        ...first,
        columns: [...first.columns, { field: 'gone', kind: 'text' }],
      };
      expect(
        censusProblems(models, [stale, ...EXPORT_FILES.slice(1)], EXCLUDED_MODELS, dates),
      ).toEqual(['User.gone: exported but not a field']);
    });

    it('objects to a calendar day typed as an instant', () => {
      const plans = EXPORT_FILES.find((f) => f.model === 'Plan') as ExportFile;
      const wrong: ExportFile = {
        ...plans,
        columns: plans.columns.map((c) =>
          c.field === 'plannedStart' ? { ...c, kind: 'instant' } : c,
        ),
      };
      const rest = EXPORT_FILES.filter((f) => f !== plans);
      expect(censusProblems(models, [...rest, wrong], EXCLUDED_MODELS, dates)).toEqual([
        'Plan.plannedStart: kind instant, schema says date',
      ]);
    });

    it('objects to a withheld field with no reason', () => {
      const bare: ExportFile = { ...first, withheld: { ...first.withheld, updatedAt: ' ' } };
      expect(
        censusProblems(models, [bare, ...EXPORT_FILES.slice(1)], EXCLUDED_MODELS, dates),
      ).toEqual(['User.updatedAt: withheld without a reason']);
    });
  });
});
