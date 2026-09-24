import { describe, expect, it } from 'vitest';

import { importXer } from './import-xer.js';
import {
  decodeLayoutFields,
  encodeLayoutFields,
  LAYOUT_LABEL_PLACED_START,
  LAYOUT_LABEL_ROW,
} from './xer-layout-fields.js';
import { parseXer, type XerDocument } from './xer-parser.js';
import { buildXer, type XerTableSpec } from './xer.fixtures.js';

/**
 * Every edge case in the spec's §2 table for reading the layout fields (layout-interchange M2-T1).
 * The documents are built as XER text and parsed by the real parser, so the reader sees exactly the
 * `Map`-keyed rows a real import hands it.
 */

const KNOWN = { taskIds: new Set(['T1', 'T2', 'T3']), wbsIds: new Set(['W1']) };

const UDFTYPE_FIELDS = [
  'udf_type_id',
  'table_name',
  'udf_type_name',
  'udf_type_label',
  'logical_data_type',
];
const UDFVALUE_FIELDS = [
  'udf_type_id',
  'fk_id',
  'proj_id',
  'udf_date',
  'udf_number',
  'udf_text',
  'udf_code_id',
];

const OUR_TYPES: string[][] = [
  ['1', 'TASK', 'user_field_1', LAYOUT_LABEL_PLACED_START, 'FT_TEXT'],
  ['2', 'TASK', 'user_field_2', LAYOUT_LABEL_ROW, 'FT_INT'],
  ['3', 'PROJWBS', 'user_field_3', LAYOUT_LABEL_ROW, 'FT_INT'],
];

const placed = (fk: string, text: string, proj = 'P1'): string[] => [
  '1',
  fk,
  proj,
  '',
  '',
  text,
  '',
];
const row = (fk: string, n: string, typeId = '2', proj = 'P1'): string[] => [
  typeId,
  fk,
  proj,
  '',
  n,
  '',
  '',
];

function doc(types: string[][], values: string[][]): XerDocument {
  const tables: XerTableSpec[] = [
    { name: 'PROJECT', fields: ['proj_id', 'proj_short_name'], rows: [['P1', 'Sample']] },
    { name: 'UDFTYPE', fields: UDFTYPE_FIELDS, rows: types },
    { name: 'UDFVALUE', fields: UDFVALUE_FIELDS, rows: values },
  ];
  const parsed = parseXer(buildXer(tables));
  if (!parsed.ok) throw new Error(`fixture did not parse: ${parsed.error.code}`);
  return parsed.document;
}

const decode = (types: string[][], values: string[][]) =>
  decodeLayoutFields(doc(types, values), 'P1', KNOWN);

describe('decodeLayoutFields', () => {
  it('reads a placed start and a row for a task, and a row for a WBS summary', () => {
    const { layout, findings } = decode(OUR_TYPES, [
      placed('T1', '2026-03-02'),
      row('T1', '4'),
      row('T2', '0'),
      row('W1', '2', '3'),
    ]);
    expect(Object.fromEntries(layout)).toEqual({
      T1: { placedStart: '2026-03-02', lane: 4 },
      T2: { placedStart: null, lane: 0 },
      'wbs:W1': { placedStart: null, lane: 2 },
    });
    expect(findings).toEqual([]);
  });

  it('a file with no UDFTYPE table reads nothing and reports nothing (the foreign path is unchanged)', () => {
    const parsed = parseXer(buildXer([{ name: 'PROJECT', fields: ['proj_id'], rows: [['P1']] }]));
    if (!parsed.ok) throw new Error('fixture');
    expect(decodeLayoutFields(parsed.document, 'P1', KNOWN)).toEqual({
      layout: new Map(),
      findings: [],
    });
  });

  it('matches the label exactly: a near miss is a foreign field, reported once as a count', () => {
    const { layout, findings } = decode(
      [
        ['1', 'TASK', 'x', 'SchedulePoint layout v1: Placed Start', 'FT_TEXT'],
        ['2', 'TASK', 'y', 'Contractor', 'FT_TEXT'],
      ],
      [['1', 'T1', 'P1', '', '', '2026-03-02', '']],
    );
    expect(layout.size).toBe(0);
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'drop',
        detail: '2 user-defined field type(s) were not imported',
      }),
    ]);
  });

  it('a label from a newer version is reported as not applied, never read', () => {
    const { layout, findings } = decode(
      [['1', 'TASK', 'x', 'SchedulePoint layout v2: placed start', 'FT_TEXT']],
      [placed('T1', '2026-03-02')],
    );
    expect(layout.size).toBe(0);
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'drop',
        detail: expect.stringContaining('newer SchedulePoint'),
      }),
    ]);
  });

  it('a label named __proto__ cannot match anything', () => {
    const { layout } = decode(
      [['1', 'TASK', 'x', '__proto__', 'FT_TEXT']],
      [placed('T1', '2026-03-02')],
    );
    expect(layout.size).toBe(0);
  });

  it('discards an invalid date and an impossible date, counted in one finding', () => {
    const { layout, findings } = decode(OUR_TYPES, [
      placed('T1', '2026-02-30'),
      placed('T2', '02/03/2026'),
      placed('T3', '2026-03-02'),
    ]);
    expect([...layout.keys()]).toEqual(['T3']);
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'repair', detail: expect.stringMatching(/^2 placed start/) }),
    ]);
  });

  it('accepts a whole row written as a decimal and discards a fraction, a negative and an overflow', () => {
    const { layout, findings } = decode(OUR_TYPES, [
      row('T1', '3.00'),
      row('T2', '2.5'),
      row('T3', '-1'),
      row('W1', '10001', '3'),
    ]);
    expect(Object.fromEntries(layout)).toEqual({ T1: { placedStart: null, lane: 3 } });
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'repair', detail: expect.stringMatching(/^3 row value/) }),
    ]);
  });

  it('keeps the first of two values for one field and reports the rest', () => {
    const { layout, findings } = decode(OUR_TYPES, [row('T1', '1'), row('T1', '7')]);
    expect(layout.get('T1')).toEqual({ placedStart: null, lane: 1 });
    expect(findings).toEqual([
      expect.objectContaining({ detail: expect.stringMatching(/^1 repeated layout value/) }),
    ]);
  });

  it('discards a value naming no activity in the file', () => {
    const { layout, findings } = decode(OUR_TYPES, [row('T99', '1'), row('W99', '1', '3')]);
    expect(layout.size).toBe(0);
    expect(findings).toEqual([
      expect.objectContaining({
        detail: expect.stringMatching(/^2 layout value\(s\) named no activity/),
      }),
    ]);
  });

  it('discards a placed start on a WBS summary', () => {
    const { layout, findings } = decode(
      [...OUR_TYPES, ['4', 'PROJWBS', 'z', LAYOUT_LABEL_PLACED_START, 'FT_TEXT']],
      [['4', 'W1', 'P1', '', '', '2026-03-02', '']],
    );
    expect(layout.size).toBe(0);
    expect(findings).toEqual([
      expect.objectContaining({ detail: expect.stringMatching(/on a WBS summary/) }),
    ]);
  });

  it('reads only the imported project, and a value with no project', () => {
    const { layout } = decode(OUR_TYPES, [row('T1', '1', '2', 'P2'), row('T2', '5', '2', '')]);
    expect(Object.fromEntries(layout)).toEqual({ T2: { placedStart: null, lane: 5 } });
  });

  it('a second definition of one field is reported and its values ignored', () => {
    const { layout, findings } = decode(
      [...OUR_TYPES, ['9', 'TASK', 'dup', LAYOUT_LABEL_ROW, 'FT_INT']],
      [row('T1', '1'), row('T2', '6', '9')],
    );
    expect(Object.fromEntries(layout)).toEqual({ T1: { placedStart: null, lane: 1 } });
    expect(findings).toEqual([
      expect.objectContaining({
        detail: expect.stringMatching(/^1 duplicate SchedulePoint layout field/),
      }),
    ]);
  });
});

describe('encodeLayoutFields', () => {
  it('writes nothing when nothing carries a layout', () => {
    expect(encodeLayoutFields([{ id: 'T1', type: 'TASK' }], 'P1')).toEqual([]);
  });

  it('round-trips through the parser and the reader', () => {
    const tables = encodeLayoutFields(
      [
        { id: 'T1', type: 'TASK', layout: { placedStart: '2026-03-02', lane: 4 } },
        { id: 'T2', type: 'TASK', layout: { placedStart: null, lane: 0 } },
        { id: 'wbs:W1', type: 'WBS_SUMMARY', layout: { placedStart: '2026-03-02', lane: 2 } },
      ],
      'P1',
    );
    const specs: XerTableSpec[] = tables.map((t) => ({
      name: t.name,
      fields: t.fields,
      rows: t.rows.map((r) => t.fields.map((f) => r[f] ?? '')),
    }));
    const parsed = parseXer(
      buildXer([{ name: 'PROJECT', fields: ['proj_id'], rows: [['P1']] }, ...specs]),
    );
    if (!parsed.ok) throw new Error('fixture');
    const { layout, findings } = decodeLayoutFields(parsed.document, 'P1', KNOWN);
    expect(findings).toEqual([]);
    expect(Object.fromEntries(layout)).toEqual({
      T1: { placedStart: '2026-03-02', lane: 4 },
      T2: { placedStart: null, lane: 0 },
      // A summary carries its row only: its placement is never written.
      'wbs:W1': { placedStart: null, lane: 2 },
    });
  });
});

/**
 * **FC-4, as committed** (`docs/specs/layout-interchange/conditions.md`): a foreign XER carrying
 * `UDFTYPE` rows whose labels nearly match ours imports to a graph byte-identical to the same file
 * without those rows, and the `v2` label adds exactly one "newer version" drop. Run through the whole
 * import, not the reader alone, because the claim is about the graph.
 */
describe('FC-4 — near-miss labels are somebody else’s field', () => {
  const base: XerTableSpec[] = [
    {
      name: 'PROJECT',
      fields: ['proj_id', 'proj_short_name', 'plan_start_date'],
      rows: [['P1', 'Sample', '2026-01-05 00:00']],
    },
    {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows: [['T1', 'P1', 'A1000', 'Mobilise', 'TT_Task', '40']],
    },
  ];
  const nearMiss = (label: string): XerTableSpec[] => [
    { name: 'UDFTYPE', fields: UDFTYPE_FIELDS, rows: [['1', 'TASK', 'u1', label, 'FT_INT']] },
    { name: 'UDFVALUE', fields: UDFVALUE_FIELDS, rows: [['1', 'T1', 'P1', '', '3', '', '']] },
  ];
  const run = (tables: XerTableSpec[]) => {
    const result = importXer({ content: buildXer(tables), filename: 'f.xer' });
    if (!result.ok) throw new Error(result.error.code);
    return result;
  };
  const plain = run(base);

  it.each(['SchedulePoint layout v1: Row', 'SchedulePoint layout v1:row'])(
    '“%s” leaves the graph byte-identical and is one foreign-field drop',
    (label) => {
      const result = run([...base, ...nearMiss(label)]);
      expect(JSON.stringify(result.graph)).toBe(JSON.stringify(plain.graph));
      expect(result.report.drops).toEqual([
        ...plain.report.drops,
        expect.objectContaining({ detail: '1 user-defined field type(s) were not imported' }),
      ]);
    },
  );

  it('“SchedulePoint layout v2: row” leaves the graph byte-identical and adds exactly one newer-version drop', () => {
    const result = run([...base, ...nearMiss('SchedulePoint layout v2: row')]);
    expect(JSON.stringify(result.graph)).toBe(JSON.stringify(plain.graph));
    expect(result.report.drops).toEqual([
      ...plain.report.drops,
      expect.objectContaining({ detail: expect.stringContaining('newer SchedulePoint') }),
    ]);
  });
});
