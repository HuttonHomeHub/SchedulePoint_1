import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { EXCLUDED_MODELS, EXPORT_FILES, type ExportFile } from './export-columns';
import {
  buildManifest,
  buildReadme,
  csvHeader,
  csvRecord,
  CSV_BOM,
  jsonArrayPrefix,
  jsonArraySuffix,
  jsonLine,
  jsonValue,
} from './export-serialise';

/** A throwaway file so each kind is exercised without depending on a real table's shape. */
const KINDS: ExportFile = {
  model: 'Fake',
  table: 'fakes',
  file: 'fakes',
  read: 'org',
  withheld: {},
  stability: 'promised',
  columns: [
    { field: 'text', kind: 'text' },
    { field: 'int', kind: 'int' },
    { field: 'big', kind: 'bigint' },
    { field: 'dec', kind: 'decimal' },
    { field: 'at', kind: 'instant' },
    { field: 'day', kind: 'date' },
    { field: 'flag', kind: 'boolean' },
    { field: 'mode', kind: 'enum' },
    { field: 'blob', kind: 'json' },
  ],
};

const FULL = {
  text: 'Pour slab',
  int: -5,
  big: 9007199254740993n,
  dec: new Prisma.Decimal('99999999999999.9999'),
  at: new Date('2026-10-14T09:30:00.000Z'),
  day: new Date('2026-10-14T00:00:00.000Z'),
  flag: true,
  mode: 'TASK',
  blob: { a: [1, 2], b: 'x' },
};

const NULLS = Object.fromEntries(Object.keys(FULL).map((k) => [k, null]));

describe('jsonValue', () => {
  it('writes a BigInt beyond 2^53 as an exact decimal string', () => {
    expect(jsonValue('bigint', 9007199254740993n)).toBe('9007199254740993');
  });

  it('writes a Decimal(18,4) maximum without losing a digit', () => {
    expect(jsonValue('decimal', new Prisma.Decimal('99999999999999.9999'))).toBe(
      '99999999999999.9999',
    );
    // A Number round trip would have produced 100000000000000.
    expect(jsonValue('decimal', new Prisma.Decimal('0.0001'))).toBe('0.0001');
  });

  it('writes an instant as ISO UTC and a calendar day as YYYY-MM-DD', () => {
    expect(jsonValue('instant', new Date('2026-10-14T09:30:00.000Z'))).toBe(
      '2026-10-14T09:30:00.000Z',
    );
    expect(jsonValue('date', new Date('2026-10-14T00:00:00.000Z'))).toBe('2026-10-14');
  });

  it('keeps null as null in every kind', () => {
    for (const column of KINDS.columns) expect(jsonValue(column.kind, null)).toBeNull();
  });
});

describe('jsonLine', () => {
  it('serialises every kind, in the registry order, and survives JSON.stringify of a BigInt', () => {
    const parsed = JSON.parse(jsonLine(KINDS, FULL)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(KINDS.columns.map((c) => c.field));
    expect(parsed).toMatchObject({
      big: '9007199254740993',
      dec: '99999999999999.9999',
      at: '2026-10-14T09:30:00.000Z',
      day: '2026-10-14',
      blob: { a: [1, 2], b: 'x' },
    });
  });

  it('drops a field the registry does not name (a withheld column cannot leak)', () => {
    const parsed = JSON.parse(jsonLine(KINDS, { ...FULL, tokenHash: 'secret' })) as object;
    expect(parsed).not.toHaveProperty('tokenHash');
  });

  it('frames an array one element a line, and an empty one as []', () => {
    expect(
      jsonArrayPrefix(0) + '{"a":1}' + jsonArrayPrefix(1) + '{"a":2}' + jsonArraySuffix(2),
    ).toBe('[\n{"a":1},\n{"a":2}\n]\n');
    expect(jsonArraySuffix(0)).toBe('[]\n');
  });
});

describe('csv', () => {
  it('leads the header with the BOM and ends records with CRLF', () => {
    expect(csvHeader(KINDS).startsWith(CSV_BOM)).toBe(true);
    expect(csvHeader(KINDS)).toBe(`${CSV_BOM}text,int,big,dec,at,day,flag,mode,blob\r\n`);
    expect(csvRecord(KINDS, FULL).endsWith('\r\n')).toBe(true);
  });

  it('writes null as an empty cell in every kind', () => {
    expect(csvRecord(KINDS, NULLS)).toBe(',,,,,,,,\r\n');
  });

  it('writes the same digits as the JSON for bigint, decimal and dates', () => {
    expect(csvRecord(KINDS, FULL)).toBe(
      'Pour slab,-5,9007199254740993,99999999999999.9999,2026-10-14T09:30:00.000Z,2026-10-14,true,TASK,' +
        '"{""a"":[1,2],""b"":""x""}"\r\n',
    );
  });

  it('guards a text formula but never prefixes a negative number', () => {
    const row = { ...FULL, text: '=SUM(A1)', int: -5, dec: new Prisma.Decimal('-5.2500') };
    const cells = csvRecord(KINDS, row).split(',');
    expect(cells[0]).toBe("'=SUM(A1)");
    expect(cells[1]).toBe('-5');
    expect(cells[3]).toBe('-5.25');
  });

  it('quotes commas, quotes and line breaks in text and keeps Unicode', () => {
    const row = { ...NULLS, text: 'Brücke, "north"\r\nφ' };
    expect(csvRecord(KINDS, row)).toBe('"Brücke, ""north""\r\nφ",,,,,,,,\r\n');
  });

  it('writes a 32 kB JSON value as one compact cell', () => {
    const blob = { v: 'x'.repeat(32 * 1024) };
    const record = csvRecord(KINDS, { ...NULLS, blob });
    expect(record).toContain(`{""v"":""${'x'.repeat(32 * 1024)}""}`);
    expect(record.split('\r\n')).toHaveLength(2);
  });
});

describe('manifest and README', () => {
  const manifest = JSON.parse(
    buildManifest({
      generatedAt: new Date('2026-10-14T09:30:00.000Z'),
      apiVersion: '0.93.0',
      organization: { id: 'o1', slug: 'acme', name: 'Acme' },
      exportedBy: { userId: 'u1', name: 'Ada' },
      files: [
        {
          path: 'json/clients.json',
          file: 'clients',
          kind: 'json',
          rows: 0,
          bytes: 3,
          sha256: 'ab',
        },
      ],
    }),
  ) as Record<string, unknown>;

  it('has the documented shape', () => {
    expect(Object.keys(manifest)).toEqual([
      'format',
      'formatVersion',
      'generatedAt',
      'generator',
      'organization',
      'exportedBy',
      'snapshot',
      'includesDeleted',
      'files',
      'excluded',
    ]);
    expect(manifest).toMatchObject({
      format: 'schedulepoint.organisation-export',
      formatVersion: '1.0',
      generatedAt: '2026-10-14T09:30:00.000Z',
      snapshot: 'consistent',
      includesDeleted: true,
    });
  });

  it('declares every withheld credential as excluded', () => {
    const excluded = (manifest['excluded'] as { name: string }[]).map((e) => e.name);
    expect(excluded).toEqual(
      expect.arrayContaining([
        'sign-in accounts and credentials',
        'sign-in sessions',
        'invitations.tokenHash',
        'shares.tokenHash',
        'audit-events.ipAddress',
        'audit-events.userAgent',
      ]),
    );
  });

  it('names no database table, and scopes every exclusion with a closed set', () => {
    const excluded = manifest['excluded'] as { scope: string; name: string }[];
    expect([...new Set(excluded.map((e) => e.scope))].sort()).toEqual([
      'column',
      'record-type',
      'rows',
    ]);
    const tables = EXPORT_FILES.map((f) => f.table).concat(EXCLUDED_MODELS.map((m) => m.table));
    for (const entry of excluded) expect(tables).not.toContain(entry.name);
    // A `column` exclusion is always `<exported file>.<field>`, a stable form.
    const files = EXPORT_FILES.map((f) => f.file);
    for (const entry of excluded.filter((e) => e.scope === 'column')) {
      expect(files).toContain(entry.name.split('.')[0]);
      expect(entry.name).toMatch(/^[a-z-]+\.\w+$/);
    }
    expect(JSON.stringify(manifest)).not.toMatch(/"table"/);
  });

  it('carries each file’s stability, with the migration records informational', () => {
    const entry = (manifest['files'] as Record<string, unknown>[])[0];
    expect(entry).toEqual({
      path: 'json/clients.json',
      file: 'clients',
      kind: 'json',
      rows: 0,
      bytes: 3,
      sha256: 'ab',
      stability: 'promised',
    });
    const informational = JSON.parse(
      buildManifest({
        generatedAt: new Date(0),
        apiVersion: '0',
        organization: { id: 'o', slug: 's', name: 'n' },
        exportedBy: { userId: 'u', name: 'n' },
        files: [
          {
            path: 'json/records-cross-plan-lags.json',
            file: 'records-cross-plan-lags',
            kind: 'json',
            rows: 0,
            bytes: 0,
            sha256: '',
          },
        ],
      }),
    ) as { files: { stability: string }[] };
    expect(informational.files[0]?.stability).toBe('informational');
  });

  it('writes a README that names every file and is stable between calls', () => {
    const readme = buildReadme();
    expect(buildReadme()).toBe(readme);
    for (const file of EXPORT_FILES) expect(readme).toContain(`json/${file.file}.json`);
  });
});

describe('the format’s edge cases', () => {
  it('pins the byte-order mark to the literal UTF-8 bytes EF BB BF', () => {
    expect([...Buffer.from(CSV_BOM, 'utf8')]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('guards and quotes a HYPERLINK formula, and a formula after a line break', () => {
    expect(csvRecord(KINDS, { ...NULLS, text: '=HYPERLINK("a","b")' })).toBe(
      '"\'=HYPERLINK(""a"",""b"")",,,,,,,,\r\n',
    );
    // \s in the guard covers a leading line break, so this is guarded as well as quoted.
    expect(csvRecord(KINDS, { ...NULLS, text: '\n=1+1' })).toBe('"\'\n=1+1",,,,,,,,\r\n');
  });

  it('applies the guard to a bare JSON number, which the JSON file keeps exact', () => {
    expect(csvRecord(KINDS, { ...NULLS, blob: -5 })).toBe(",,,,,,,,'-5\r\n");
    expect(jsonLine(KINDS, { ...NULLS, blob: -5 })).toContain('"blob":-5');
  });

  it('keeps emoji, U+2028 and a line break in text on one JSON line', () => {
    const line = jsonLine(KINDS, { ...NULLS, text: 'a\n\u2028😀\r' });
    expect(line).not.toMatch(/[\n\r]/);
    expect((JSON.parse(line) as { text: string }).text).toBe('a\n\u2028😀\r');
  });

  it('keeps false, 0 and a negative BigInt, and treats undefined as null', () => {
    const line = JSON.parse(jsonLine(KINDS, { ...NULLS, flag: false, int: 0, big: -7n })) as Record<
      string,
      unknown
    >;
    expect(line).toMatchObject({ flag: false, int: 0, big: '-7' });
    expect(csvRecord(KINDS, { ...NULLS, flag: false, int: 0, big: -7n })).toBe(
      ',0,-7,,,,false,,\r\n',
    );
    expect(jsonValue('int', undefined)).toBeNull();
  });

  it('never prints a Decimal in exponent form', () => {
    expect(jsonValue('decimal', new Prisma.Decimal('1e21'))).toBe('1000000000000000000000');
    expect(jsonValue('decimal', new Prisma.Decimal('1e-7'))).toBe('0.0000001');
  });

  it('writes a @db.Date read back at a non-midnight instant as its UTC day', () => {
    expect(jsonValue('date', new Date('2026-10-14T23:59:59.999Z'))).toBe('2026-10-14');
  });

  it('reads a renamed column from its source field and writes it under the exported name', () => {
    const renamed: ExportFile = {
      ...KINDS,
      columns: [{ field: 'totalFloatMinutes', kind: 'int', source: 'totalFloat' }],
    };
    expect(jsonLine(renamed, { totalFloat: 480 })).toBe('{"totalFloatMinutes":480}');
    expect(csvHeader(renamed)).toBe(`${CSV_BOM}totalFloatMinutes\r\n`);
    expect(csvRecord(renamed, { totalFloat: 480 })).toBe('480\r\n');
  });
});
