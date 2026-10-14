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
 * The DMMF is the GENERATED client, which goes stale when someone edits `schema.prisma` and does not
 * run `prisma generate`, so `schema.prisma` itself is read as well and the two must agree on every
 * model and scalar field. Otherwise a stale client would hide exactly the new column this exists for.
 *
 * `censusProblems` is a function so a negative control can hand it a broken registry and watch it
 * object (ADR-0110: a gate is verified against the defect it names). Without that, a census that
 * reads an empty DMMF would pass for ever.
 */
interface DmmfField {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly isList?: boolean;
}
interface DmmfModel {
  readonly name: string;
  readonly dbName?: string | null;
  readonly fields: readonly DmmfField[];
}

const SCHEMA = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

interface SchemaText {
  /** `Model.field` for every `@db.Date` column: the DMMF cannot tell a calendar day from an instant. */
  readonly dateFields: ReadonlySet<string>;
  /** Every model's scalar (non-relation) field names, as written in `schema.prisma`. */
  readonly scalars: ReadonlyMap<string, ReadonlySet<string>>;
}

function schemaText(): SchemaText {
  const blocks = [...SCHEMA.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)];
  const modelNames = new Set(blocks.map((b) => b[1]));
  const dateFields = new Set<string>();
  const scalars = new Map<string, Set<string>>();
  for (const [, model, body] of blocks) {
    const names = new Set<string>();
    for (const line of (body ?? '').split('\n')) {
      const field = /^\s+(\w+)\s+(\w+)(\[\])?\??(\s|$)/.exec(line);
      if (!field || line.trim().startsWith('//') || line.trim().startsWith('@@')) continue;
      if (!modelNames.has(field[2] ?? '')) names.add(field[1] ?? '');
      if (/DateTime\??\s.*@db\.Date\b/.test(line)) dateFields.add(`${model}.${field[1]}`);
    }
    scalars.set(model ?? '', names);
  }
  return { dateFields, scalars };
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
  text: SchemaText,
): string[] {
  const problems: string[] = [];
  const included = new Map(files.map((f) => [f.model, f]));
  const out = new Map(excluded.map((e) => [e.model, e]));

  for (const model of models) {
    const file = included.get(model.name);
    const skipped = out.get(model.name);
    const scalars = model.fields.filter((f) => f.kind !== 'object');

    const written = text.scalars.get(model.name);
    if (!written) problems.push(`${model.name}: in the client but not in schema.prisma`);
    for (const field of scalars) {
      if (written && !written.has(field.name)) {
        problems.push(`${model.name}.${field.name}: in the client but not in schema.prisma`);
      }
      if (field.isList) problems.push(`${model.name}.${field.name}: a list-typed scalar`);
    }
    for (const name of written ?? []) {
      if (!scalars.some((f) => f.name === name)) {
        problems.push(
          `${model.name}.${name}: in schema.prisma but not in the client (run prisma generate)`,
        );
      }
    }

    if (!file && !skipped) problems.push(`${model.name}: neither exported nor excluded`);
    if (file && skipped) problems.push(`${model.name}: both exported and excluded`);
    if (skipped && !skipped.reason.trim())
      problems.push(`${model.name}: excluded without a reason`);
    if (!file) continue;

    if (file.table !== model.dbName) problems.push(`${model.name}: table is ${model.dbName}`);
    const byName = new Map(scalars.map((f) => [f.name, f]));
    const sourceOf = (c: { field: string; source?: string }): string => c.source ?? c.field;
    const columnNames = new Set(file.columns.map(sourceOf));

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
    if (new Set(file.columns.map((c) => c.field)).size !== file.columns.length) {
      problems.push(`${model.name}: duplicate exported name`);
    }
    for (const column of file.columns) {
      const field = byName.get(sourceOf(column));
      if (!field) {
        problems.push(`${model.name}.${sourceOf(column)}: exported but not a field`);
        continue;
      }
      const wanted =
        field.kind === 'enum'
          ? ['enum']
          : field.type === 'DateTime'
            ? [text.dateFields.has(`${model.name}.${field.name}`) ? 'date' : 'instant']
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
  const text = schemaText();

  it('reads the whole schema, not an empty or partial one', () => {
    const declared = [...SCHEMA.matchAll(/^model \w+ \{/gm)].length;
    expect(models.length).toBe(declared);
    expect(models.length).toBeGreaterThan(30);
    expect(text.scalars.size).toBe(declared);
  });

  it('has a decision for every model and every column', () => {
    expect(censusProblems(models, EXPORT_FILES, EXCLUDED_MODELS, text)).toEqual([]);
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

  it('names the unit of every duration, lag, float and delay column', () => {
    // The stored float columns are minutes while the API serves the same names in working days, so
    // a bare `totalFloat` in the file would be read in the API's unit and be wrong by a factor.
    const unitless = EXPORT_FILES.flatMap((f) =>
      f.columns
        .filter((c) => c.kind === 'int' && /float|duration|lag|delay|drift/i.test(c.field))
        .filter((c) => !/(Minutes|Days)$/.test(c.field))
        .map((c) => `${f.file}.${c.field}`),
    );
    expect(unitless).toEqual([]);
    const activities = EXPORT_FILES.find((f) => f.model === 'Activity');
    expect(activities?.columns.filter((c) => c.source)).toEqual([
      { field: 'totalFloatMinutes', kind: 'int', source: 'totalFloat' },
      { field: 'freeFloatMinutes', kind: 'int', source: 'freeFloat' },
      { field: 'remainingFloatMinutes', kind: 'int', source: 'remainingFloat' },
    ]);
  });

  it('marks exactly the three migration records as informational', () => {
    expect(EXPORT_FILES.filter((f) => f.stability === 'informational').map((f) => f.file)).toEqual([
      'records-placement-migrations',
      'records-finish-milestone-dates',
      'records-cross-plan-lags',
    ]);
  });

  describe('negative controls: it can fail', () => {
    const first = EXPORT_FILES[0] as ExportFile;
    const run = (
      overrides: {
        models?: readonly DmmfModel[];
        files?: readonly ExportFile[];
        excluded?: readonly ExcludedModel[];
        text?: SchemaText;
      } = {},
    ): string[] =>
      censusProblems(
        overrides.models ?? models,
        overrides.files ?? EXPORT_FILES,
        overrides.excluded ?? EXCLUDED_MODELS,
        overrides.text ?? text,
      );
    const withFile = (model: string, change: (f: ExportFile) => ExportFile): ExportFile[] =>
      EXPORT_FILES.map((f) => (f.model === model ? change(f) : f));
    const withText = (model: string, field: string): SchemaText => ({
      ...text,
      scalars: new Map([
        ...text.scalars,
        [model, new Set([...(text.scalars.get(model) ?? []), field])],
      ]),
    });

    it('objects to a column the schema gained and the registry did not', () => {
      const withNew = models.map((m) =>
        m.name === 'User'
          ? {
              ...m,
              fields: [...m.fields, { name: 'passwordHint', kind: 'scalar', type: 'String' }],
            }
          : m,
      );
      expect(run({ models: withNew, text: withText('User', 'passwordHint') })).toEqual([
        'User.passwordHint: neither exported nor withheld',
      ]);
    });

    it('objects to a column in schema.prisma that a stale client does not have', () => {
      expect(run({ text: withText('User', 'newColumn') })).toEqual([
        'User.newColumn: in schema.prisma but not in the client (run prisma generate)',
      ]);
    });

    it('objects to a model the schema gained', () => {
      const withNew = [...models, { name: 'Widget', dbName: 'widgets', fields: [] }];
      const problems = run({ models: withNew });
      expect(problems).toContain('Widget: neither exported nor excluded');
    });

    it('objects to a registry column the schema no longer has', () => {
      const stale = withFile('User', (f) => ({
        ...f,
        columns: [...f.columns, { field: 'gone', kind: 'text' }],
      }));
      expect(run({ files: stale })).toEqual(['User.gone: exported but not a field']);
    });

    it('objects to a calendar day typed as an instant', () => {
      const wrong = withFile('Plan', (f) => ({
        ...f,
        columns: f.columns.map((c) => (c.field === 'plannedStart' ? { ...c, kind: 'instant' } : c)),
      }));
      expect(run({ files: wrong })).toEqual(['Plan.plannedStart: kind instant, schema says date']);
    });

    it('objects to a text column typed as an integer', () => {
      const wrong = withFile('Plan', (f) => ({
        ...f,
        columns: f.columns.map((c) => (c.field === 'name' ? { ...c, kind: 'int' } : c)),
      }));
      expect(run({ files: wrong })).toEqual(['Plan.name: kind int, schema says text']);
    });

    it('objects to a model that is both exported and excluded', () => {
      const both = [...EXCLUDED_MODELS, { model: 'User', table: 'users', label: 'x', reason: 'y' }];
      expect(run({ excluded: both })).toEqual(['User: both exported and excluded']);
    });

    it('objects to a field that is both exported and withheld', () => {
      const both = withFile('User', (f) => ({ ...f, withheld: { ...f.withheld, name: 'why' } }));
      expect(run({ files: both })).toEqual(['User.name: both exported and withheld']);
    });

    it('objects to a withheld name that is not a field', () => {
      const bogus = withFile('User', (f) => ({ ...f, withheld: { ...f.withheld, nope: 'why' } }));
      expect(run({ files: bogus })).toEqual(['User.nope: withheld but not a field']);
    });

    it('objects to a withheld field with no reason', () => {
      const bare = [
        { ...first, withheld: { ...first.withheld, updatedAt: ' ' } },
        ...EXPORT_FILES.slice(1),
      ];
      expect(run({ files: bare })).toEqual(['User.updatedAt: withheld without a reason']);
    });

    it('objects to an excluded model with no reason', () => {
      const bare = EXCLUDED_MODELS.map((e) => (e.model === 'Session' ? { ...e, reason: '' } : e));
      expect(run({ excluded: bare })).toEqual(['Session: excluded without a reason']);
    });

    it('objects to a table name that no longer matches', () => {
      const moved = withFile('User', (f) => ({ ...f, table: 'people' }));
      expect(run({ files: moved })).toEqual(['User: table is users']);
    });

    it('objects to a duplicate column', () => {
      const dup = withFile('User', (f) => ({ ...f, columns: [...f.columns, f.columns[0]!] }));
      expect(run({ files: dup })).toEqual([
        'User: duplicate column',
        'User: duplicate exported name',
      ]);
    });

    it('objects to a list-typed scalar', () => {
      const listed = models.map((m) =>
        m.name === 'User'
          ? { ...m, fields: m.fields.map((f) => (f.name === 'name' ? { ...f, isList: true } : f)) }
          : m,
      );
      expect(run({ models: listed })).toEqual(['User.name: a list-typed scalar']);
    });
  });
});
