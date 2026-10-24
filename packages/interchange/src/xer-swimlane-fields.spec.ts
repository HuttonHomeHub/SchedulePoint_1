import { describe, expect, it } from 'vitest';

import { importXer } from './import-xer.js';
import {
  decodeLayoutFields,
  LAYOUT_LABEL_SWIMLANE,
  LAYOUT_LABEL_SWIMLANE_LANE,
  LAYOUT_LABEL_SWIMLANES,
  MAX_LAYOUT_SWIMLANES,
} from './xer-layout-fields.js';
import { parseXer, type XerDocument } from './xer-parser.js';
import { buildXer, type XerTableSpec } from './xer.fixtures.js';

/**
 * The swimlane labels in a SchedulePoint XER (swimlanes M4-T4): the known labels, the near misses, an
 * unknown version, and the bounds on every value, because a swimlane name is attacker-controlled text
 * that ends up in a column with a shape CHECK. The documents are built as XER text and parsed by the
 * real parser, as in `xer-layout-fields.spec.ts`.
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

const TYPES: string[][] = [
  ['1', 'TASK', 'u1', LAYOUT_LABEL_SWIMLANE, 'FT_TEXT'],
  ['2', 'TASK', 'u2', LAYOUT_LABEL_SWIMLANE_LANE, 'FT_INT'],
  ['3', 'PROJECT', 'u3', LAYOUT_LABEL_SWIMLANES, 'FT_TEXT'],
];

const name = (fk: string, text: string, proj = 'P1'): string[] => ['1', fk, proj, '', '', text, ''];
const lane = (fk: string, n: string): string[] => ['2', fk, 'P1', '', n, '', ''];
const project = (text: string, fk = 'P1'): string[] => ['3', fk, 'P1', '', '', text, ''];
const field = (source: string, names: unknown[], level: number | null = null): string =>
  JSON.stringify({ source, level, names });

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

const decode = (values: string[][], types: string[][] = TYPES) =>
  decodeLayoutFields(doc(types, values), 'P1', KNOWN);

const details = (findings: readonly { detail: string }[]): string[] =>
  findings.map((f) => f.detail);

describe('swimlane labels — the known labels', () => {
  it('reads the source and list, each task’s swimlane, and its lane inside it', () => {
    const { layout, swimlanes, findings } = decode([
      project(field('MANUAL', ['Podium', 'Tower'])),
      name('T1', 'Tower'),
      lane('T1', '2'),
      name('T2', 'Podium'),
    ]);
    expect(swimlanes).toEqual({ source: 'MANUAL', wbsLevel: null, names: ['Podium', 'Tower'] });
    expect(Object.fromEntries(layout)).toEqual({
      T1: { placedStart: null, lane: null, swimlane: 'Tower', swimlaneLane: 2 },
      T2: { placedStart: null, lane: null, swimlane: 'Podium', swimlaneLane: null },
    });
    expect(findings).toEqual([]);
  });

  it('a name not in the list is appended in file order, and a file with no project field is MANUAL', () => {
    const { swimlanes } = decode([name('T2', 'Roof'), name('T1', 'Core')]);
    expect(swimlanes).toEqual({ source: 'MANUAL', wbsLevel: null, names: ['Roof', 'Core'] });
  });

  it('keeps an empty swimlane the list names, and a WBS source with its level', () => {
    expect(decode([project(field('MANUAL', ['Empty']))]).swimlanes?.names).toEqual(['Empty']);
    expect(decode([project(field('WBS', [], 2))]).swimlanes).toEqual({
      source: 'WBS',
      wbsLevel: 2,
      names: [],
    });
  });

  it('a NONE source with no swimlanes is nothing at all', () => {
    expect(decode([project(field('NONE', []))]).swimlanes).toBeUndefined();
  });

  it('an empty name means “No swimlane”, not a refusal', () => {
    const { layout, findings } = decode([name('T1', '')]);
    expect(layout.size).toBe(0);
    expect(findings).toEqual([]);
  });

  it('a file with the other layout labels only carries no swimlanes and no swimlane keys', () => {
    const { swimlanes, layout } = decode(
      [['1', 'T1', 'P1', '', '3', '', '']],
      [['1', 'TASK', 'u', 'SchedulePoint layout v1: lane', 'FT_INT']],
    );
    expect(swimlanes).toBeUndefined();
    expect(layout.get('T1')).toEqual({ placedStart: null, lane: 3 });
  });
});

describe('swimlane labels — names are deduped ignoring case before anything is inserted', () => {
  it('merges case variants into the first spelling and counts them once', () => {
    const { layout, swimlanes, findings } = decode([
      project(field('MANUAL', ['Level 1', 'LEVEL 1', 'level 1'])),
      name('T1', 'level 1'),
      name('T2', 'LEVEL 1'),
      name('T3', 'Level 1'),
    ]);
    expect(swimlanes?.names).toEqual(['Level 1']);
    expect([...layout.values()].map((l) => l.swimlane)).toEqual(['Level 1', 'Level 1', 'Level 1']);
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'repair',
        detail: '2 swimlane name(s) matched an earlier name ignoring case and were merged into it',
      }),
    ]);
  });

  it('folds harder than lower(): ß and SS, and a compatibility form, are one name', () => {
    const { swimlanes } = decode([
      project(field('MANUAL', ['Straße', 'STRASSE', 'ＡＢＣ', 'abc'])),
    ]);
    expect(swimlanes?.names).toEqual(['Straße', 'ＡＢＣ']);
  });

  it('trims a list entry before comparing it', () => {
    expect(decode([project(field('MANUAL', ['  Core  ', 'core']))]).swimlanes?.names).toEqual([
      'Core',
    ]);
  });
});

describe('swimlane labels — near misses and unknown versions', () => {
  it.each([
    'SchedulePoint layout v1: Swimlane',
    'SchedulePoint layout v1:swimlane',
    'SchedulePoint layout v1: swim lane',
    'SchedulePoint layout: swimlane',
  ])('“%s” is somebody else’s field', (label) => {
    const { layout, swimlanes, findings } = decode(
      [name('T1', 'Core')],
      [['1', 'TASK', 'u', label, 'FT_TEXT']],
    );
    expect(layout.size).toBe(0);
    expect(swimlanes).toBeUndefined();
    expect(details(findings)).toEqual(['1 user-defined field type(s) were not imported']);
  });

  it('a v2 swimlane label is reported as written by a newer SchedulePoint and never read', () => {
    const { layout, swimlanes, findings } = decode(
      [name('T1', 'Core')],
      [['1', 'TASK', 'u', 'SchedulePoint layout v2: swimlane', 'FT_TEXT']],
    );
    expect(layout.size).toBe(0);
    expect(swimlanes).toBeUndefined();
    expect(details(findings)).toEqual([
      '1 SchedulePoint layout field(s) were written by a newer SchedulePoint and not applied',
    ]);
  });

  it('a known label on the wrong table is a foreign field', () => {
    const { layout, swimlanes, findings } = decode(
      [name('T1', 'Core'), project(field('MANUAL', ['Core']))],
      [
        ['1', 'PROJWBS', 'u1', LAYOUT_LABEL_SWIMLANE, 'FT_TEXT'],
        ['3', 'TASK', 'u3', LAYOUT_LABEL_SWIMLANES, 'FT_TEXT'],
      ],
    );
    expect(layout.size).toBe(0);
    expect(swimlanes).toBeUndefined();
    expect(details(findings)).toEqual(['2 user-defined field type(s) were not imported']);
  });
});

describe('swimlane labels — hostile values are bounded and counted', () => {
  it('refuses a name with a control character, an overlong name, and counts them once', () => {
    const { layout, swimlanes, findings } = decode([
      name('T1', 'Two\u0007Lines'),
      name('T2', 'x'.repeat(81)),
      name('T3', 'Fine'),
    ]);
    expect(swimlanes?.names).toEqual(['Fine']);
    expect([...layout.keys()]).toEqual(['T3']);
    expect(details(findings)).toEqual([
      '2 swimlane name(s) were not 1 to 80 characters without control characters and were discarded',
    ]);
  });

  it('counts characters the way the database does: 80 emoji pass, 81 do not', () => {
    expect(decode([project(field('MANUAL', ['😀'.repeat(80)]))]).swimlanes?.names).toHaveLength(1);
    const over = decode([project(field('MANUAL', ['😀'.repeat(81)]))]);
    expect(over.swimlanes?.names).toEqual([]);
    expect(over.findings).toHaveLength(1);
  });

  it('accepts exactly 80 characters', () => {
    expect(decode([name('T1', 'y'.repeat(80))]).swimlanes?.names).toEqual(['y'.repeat(80)]);
  });

  it('refuses list entries that are not text', () => {
    const { swimlanes, findings } = decode([
      project(field('MANUAL', ['Ok', 7, null, { a: 1 }, ['x'], ''])),
    ]);
    expect(swimlanes?.names).toEqual(['Ok']);
    expect(findings).toHaveLength(1);
  });

  it('a name that looks like a prototype key is only a name', () => {
    const { swimlanes } = decode([project(field('MANUAL', ['__proto__', 'constructor']))]);
    expect(swimlanes?.names).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(swimlanes)).toBe(Object.prototype);
  });

  it(`keeps ${String(MAX_LAYOUT_SWIMLANES)} swimlanes and counts the rest, members included`, () => {
    const names = Array.from({ length: MAX_LAYOUT_SWIMLANES + 5 }, (_, i) => `Lane ${String(i)}`);
    const { layout, swimlanes, findings } = decode([
      project(field('MANUAL', names)),
      name('T1', 'Lane 104'),
      name('T2', 'Lane 0'),
    ]);
    expect(swimlanes?.names).toHaveLength(MAX_LAYOUT_SWIMLANES);
    expect([...layout.keys()]).toEqual(['T2']);
    expect(details(findings)).toEqual([
      `${String(5 + 1)} swimlane name(s) past the limit of ${String(MAX_LAYOUT_SWIMLANES)} were not imported`,
    ]);
  });

  it('discards a project field past the size bound without parsing it', () => {
    const huge = field('MANUAL', ['a'.repeat(70_000)]);
    const { swimlanes, findings } = decode([project(huge)]);
    expect(swimlanes).toBeUndefined();
    expect(details(findings)).toEqual([
      '1 swimlane source and list could not be read and were discarded',
    ]);
  });

  it.each([
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['a string', '"MANUAL"'],
    ['an unknown source', field('GROUPS', [])],
    ['a WBS source with no level', field('WBS', [])],
    ['a WBS level of 4', field('WBS', [], 4)],
    ['a level on a MANUAL source', field('MANUAL', [], 2)],
    ['names that are not a list', JSON.stringify({ source: 'MANUAL', names: 'a' })],
  ])('discards a project field that is %s, and imports the tasks’ own names', (_what, text) => {
    const { swimlanes, findings } = decode([project(text), name('T1', 'Core')]);
    expect(swimlanes).toEqual({ source: 'MANUAL', wbsLevel: null, names: ['Core'] });
    expect(details(findings)).toEqual([
      '1 swimlane source and list could not be read and were discarded',
    ]);
  });

  it.each(['-1', '1.5', '10001', 'abc'])('discards a swimlane lane of %s', (value) => {
    const { layout, findings } = decode([name('T1', 'Core'), lane('T1', value)]);
    expect(layout.get('T1')).toEqual(
      expect.objectContaining({ swimlane: 'Core', swimlaneLane: null }),
    );
    expect(details(findings)).toEqual([
      '1 swimlane lane value(s) were not a whole number from 0 to 10000 and were discarded',
    ]);
  });

  it('accepts the edges of the lane range', () => {
    const { layout } = decode([
      name('T1', 'Core'),
      lane('T1', '10000'),
      name('T2', 'Core'),
      lane('T2', '0'),
    ]);
    expect(layout.get('T1')?.swimlaneLane).toBe(10_000);
    expect(layout.get('T2')?.swimlaneLane).toBe(0);
  });

  it('discards a lane that belongs to an activity with no swimlane', () => {
    const { layout, findings } = decode([lane('T1', '3')]);
    expect(layout.size).toBe(0);
    expect(details(findings)).toEqual([
      '1 swimlane lane value(s) belonged to an activity with no readable swimlane and were discarded',
    ]);
  });

  it('keeps the first of two names for one task, and ignores a value for another project', () => {
    const { layout, findings } = decode([
      name('T1', 'First'),
      name('T1', 'Second'),
      name('T2', 'Elsewhere', 'P9'),
    ]);
    expect([...layout.keys()]).toEqual(['T1']);
    expect(layout.get('T1')?.swimlane).toBe('First');
    expect(details(findings)).toEqual([
      '1 repeated layout value(s) were discarded; the first in the file was kept',
    ]);
  });

  it('discards a name for a task the file does not have, and a project field for another project', () => {
    const { layout, swimlanes, findings } = decode([
      name('T99', 'Ghost'),
      project(field('MANUAL', ['Other']), 'P9'),
    ]);
    expect(layout.size).toBe(0);
    expect(swimlanes).toBeUndefined();
    expect(details(findings)).toEqual([
      '2 layout value(s) named no activity in the file and were discarded',
    ]);
  });
});

describe('swimlane labels — through the whole import', () => {
  const base: XerTableSpec[] = [
    {
      name: 'PROJECT',
      fields: ['proj_id', 'proj_short_name', 'plan_start_date'],
      rows: [['P1', 'Sample', '2026-01-05 00:00']],
    },
    {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows: [
        ['T1', 'P1', 'A1000', 'Mobilise', 'TT_Task', '40'],
        ['T2', 'P1', 'A1010', 'Dig', 'TT_Task', '40'],
        ['T3', 'P1', 'A1020', 'Pour', 'TT_Task', '40'],
      ],
    },
  ];
  const withSwimlanes: XerTableSpec[] = [
    ...base,
    { name: 'UDFTYPE', fields: UDFTYPE_FIELDS, rows: TYPES },
    {
      name: 'UDFVALUE',
      fields: UDFVALUE_FIELDS,
      rows: [
        project(field('MANUAL', ['Site', 'Structure'])),
        name('T1', 'site'),
        name('T2', 'Structure'),
        lane('T2', '1'),
      ],
    },
  ];
  const run = (tables: XerTableSpec[], restoreLayout?: 'RESTORE' | 'IGNORE') => {
    const result = importXer({
      content: buildXer(tables),
      filename: 'f.xer',
      ...(restoreLayout === undefined ? {} : { restoreLayout }),
    });
    if (!result.ok) throw new Error(result.error.code);
    return result;
  };

  it('creates the swimlanes in order, places the members, and counts both', () => {
    const { graph, report } = run(withSwimlanes);
    expect(graph.plan).toMatchObject({ swimlaneSource: 'MANUAL', swimlaneWbsLevel: null });
    expect(graph.swimlanes).toEqual([
      { key: 'swimlane:1', name: 'Site' },
      { key: 'swimlane:2', name: 'Structure' },
    ]);
    const byCode = Object.fromEntries(graph.activities.map((a) => [a.code, a]));
    expect(byCode['A1000']).toMatchObject({ swimlaneKey: 'swimlane:1' });
    expect(byCode['A1000']?.swimlaneLane).toBeUndefined();
    expect(byCode['A1010']).toMatchObject({ swimlaneKey: 'swimlane:2', swimlaneLane: 1 });
    expect(byCode['A1020']?.swimlaneKey).toBeUndefined();
    expect(report.mapped).toMatchObject({ swimlanes: 2, swimlaneMembers: 2 });
  });

  it('a foreign file has no swimlane key anywhere and reports no swimlane count', () => {
    const { graph, report } = run(base);
    expect(graph.swimlanes).toBeUndefined();
    expect(graph.plan).not.toHaveProperty('swimlaneSource');
    expect(JSON.stringify(graph)).not.toContain('swimlane');
    expect(report.mapped).not.toHaveProperty('swimlanes');
    expect(report.mapped).not.toHaveProperty('swimlaneMembers');
  });

  it('declining the layout strips the swimlanes too, and the report says so once', () => {
    const plain = run(base);
    const result = run(withSwimlanes, 'IGNORE');
    expect(JSON.stringify(result.graph)).toBe(JSON.stringify(plain.graph));
    expect(result.report.mapped).not.toHaveProperty('swimlanes');
    expect(result.report.drops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringMatching(/carries a SchedulePoint layout/),
        }),
      ]),
    );
  });

  it('a near-miss label leaves the graph byte-identical to the file without it', () => {
    const plain = run(base);
    const nearMiss = run([
      ...base,
      {
        name: 'UDFTYPE',
        fields: UDFTYPE_FIELDS,
        rows: [['1', 'TASK', 'u1', 'SchedulePoint layout v1: Swimlane', 'FT_TEXT']],
      },
      { name: 'UDFVALUE', fields: UDFVALUE_FIELDS, rows: [name('T1', 'Site')] },
    ]);
    expect(JSON.stringify(nearMiss.graph)).toBe(JSON.stringify(plain.graph));
  });
});
