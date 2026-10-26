import { describe, expect, it } from 'vitest';

import type { ExportGraph } from './export-graph.js';
import { exportMspdi } from './export-mspdi.js';
import { exportXer } from './export-xer.js';
import { buildExportGraph, buildRichExportGraph } from './export.fixtures.js';
import { importSchedule } from './import-schedule.js';
import { childElements, childText, parseMspdi } from './mspdi-parser.js';
import { NOTE_BODY_MAX, NOTE_JOINER } from './note-text.js';
import { parseXer } from './xer-parser.js';

/**
 * Notes through export (notes-through-interchange M2): the XER memo and the MSPDI `<Notes>` the pure
 * emitters write, what the export report says about them, and the round trip back through the importer
 * (FC-1 and FC-2). The exact bytes of a plan without notes are pinned too (FC-3, export half).
 */

const text = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);

/** Tricky enough to need every escape: markup characters, a tab, blank lines, a lookalike separator. */
const TRICKY: readonly string[] = [
  'plain',
  'A & B < C > D "quoted"',
  'tab\there',
  'blank\n\nlines\n\n\nand three',
  'literal <hr> and <br> and <script>alert(1)</script>',
  'ünïcödé — 日本語 \u{1F600}',
  'x'.repeat(NOTE_BODY_MAX),
];

function withNotes(
  notes: ExportGraph['notes'],
  extra: Partial<ExportGraph> = {},
  base: ExportGraph = buildExportGraph(),
): ExportGraph {
  return { ...base, ...(notes === undefined ? {} : { notes }), ...extra };
}

function xerRows(bytes: Uint8Array, table: string): ReadonlyMap<string, string>[] {
  const parsed = parseXer(bytes);
  if (!parsed.ok) throw new Error('export did not re-parse');
  return [...(parsed.document.tables.get(table)?.rows ?? [])];
}

describe('exportXer — notes', () => {
  it('writes one SchedulePoint topic and one memo per activity, oldest first, with nothing raw', () => {
    const result = exportXer({
      graph: withNotes([
        { activityKey: 'A1', body: 'first' },
        { activityKey: 'A2', body: 'on the other' },
        { activityKey: 'A1', body: 'second\twith a tab\nand a line' },
      ]),
    });
    if (!result.ok) throw new Error('export failed');

    expect(xerRows(result.bytes, 'MEMOTYPE').map((r) => Object.fromEntries(r))).toEqual([
      { memo_type_id: 'SPNOTES', memo_type: 'SchedulePoint notes v1' },
    ]);
    const memos = xerRows(result.bytes, 'TASKMEMO');
    expect(memos.map((r) => r.get('task_id'))).toEqual(['A1', 'A2']);
    expect(memos[0]?.get('task_memo')).toBe(
      '<html><body>first<hr>second&#9;with a tab<br>and a line</body></html>',
    );
    for (const memo of memos) expect(memo.get('task_memo')).not.toMatch(/[\t\n]/);
    expect(result.report.mapped.notes).toBe(3);
  });

  it('removes invisible direction characters and says how many notes that touched', () => {
    const result = exportXer({
      graph: withNotes([
        { activityKey: 'A1', body: 'clean' },
        { activityKey: 'A1', body: 'sneaky\u202Etext' },
      ]),
    });
    if (!result.ok) throw new Error('export failed');
    expect(text(result.bytes)).not.toContain('\u202E');
    expect(result.report.approximations).toContainEqual(
      expect.objectContaining({
        detail: 'invisible direction and zero-width characters were removed from 1 note',
      }),
    );
  });

  it('writes TASKMEMO with task_memo as its last column, after TASK', () => {
    const result = exportXer({ graph: withNotes([{ activityKey: 'A1', body: 'x' }]) });
    if (!result.ok) throw new Error('export failed');
    const out = text(result.bytes);
    expect(out).toMatch(/%F\tmemo_id\tproj_id\ttask_id\tmemo_type_id\ttask_memo\n/);
    expect(out.indexOf('%T\tTASKMEMO')).toBeGreaterThan(out.indexOf('%T\tTASK\n'));
  });

  it('says what was written and what was not, in aggregate', () => {
    const graph = buildRichExportGraph();
    const result = exportXer({
      graph: {
        ...graph,
        notes: [
          { activityKey: 'A1', body: 'kept' },
          { activityKey: 'wbs:100', body: 'on a summary' },
          { activityKey: 'wbs:110', body: 'on another' },
        ],
        planNoteCount: 2,
        unwrittenNoteCount: 5,
      },
    });
    if (!result.ok) throw new Error('export failed');
    expect(result.report.mapped.notes).toBe(1);
    expect(result.report.approximations).toContainEqual(
      expect.objectContaining({
        entity: 'note',
        detail:
          "1 note written as the P6 notebook topic 'SchedulePoint notes v1'; authors and dates are not written",
      }),
    );
    const noteDrops = result.report.drops.filter((f) => f.entity === 'note').map((f) => f.detail);
    expect(noteDrops).toEqual([
      '2 plan notes were not written to the exported file',
      '5 activity notes were not written to the exported file',
      '2 notes on WBS summaries were not written to the exported file',
    ]);
    expect(xerRows(result.bytes, 'TASKMEMO').map((r) => r.get('task_id'))).toEqual(['A1']);
  });

  it('writes no memo tables and no finding for a plan without notes, byte for byte', () => {
    const plain = exportXer({ graph: buildExportGraph() });
    const zero = exportXer({ graph: buildExportGraph({ planNoteCount: 0, notes: [] }) });
    if (!plain.ok || !zero.ok) throw new Error('export failed');
    expect(text(plain.bytes)).not.toMatch(/MEMOTYPE|TASKMEMO/);
    expect(text(zero.bytes)).toBe(text(plain.bytes));
    expect(zero.report).toEqual(plain.report);
    expect('notes' in plain.report.mapped).toBe(false);
  });

  it('round-trips every note byte for byte, per activity, in order (FC-1)', () => {
    const notes = [
      ...TRICKY.map((body) => ({ activityKey: 'A1', body })),
      { activityKey: 'A2', body: 'one' },
      { activityKey: 'A2', body: 'two' },
    ];
    const graph = withNotes(notes);
    const exported = exportXer({ graph });
    if (!exported.ok) throw new Error('export failed');

    const back = importSchedule({ content: exported.bytes, filename: 'round.xer' });
    if (!back.ok) throw new Error('re-import failed');
    const codeOf = new Map(back.graph.activities.map((a) => [a.key, a.code]));
    const byCode = new Map<string, string[]>();
    for (const note of back.graph.notes ?? []) {
      const code = codeOf.get(note.activityKey) ?? '?';
      byCode.set(code, [...(byCode.get(code) ?? []), note.body]);
    }
    expect(byCode.get('A1000')).toEqual([...TRICKY]);
    expect(byCode.get('A1010')).toEqual(['one', 'two']);
    expect(back.report.mapped.notes).toBe(TRICKY.length + 2);
    expect(back.report.approximations.filter((f) => f.entity === 'note')).toEqual([]);
  });
});

describe('exportMspdi — notes', () => {
  function taskNotes(bytes: Uint8Array): Map<string, string | undefined> {
    const parsed = parseMspdi(bytes);
    if (!parsed.ok) throw new Error('export did not re-parse');
    const out = new Map<string, string | undefined>();
    for (const tasks of childElements(parsed.document.project, 'Tasks')) {
      for (const task of childElements(tasks, 'Task')) {
        out.set(childText(task, 'UID') ?? '?', childText(task, 'Notes'));
      }
    }
    return out;
  }

  it('writes one escaped <Notes> per task, joined with the separator, summaries included', () => {
    const graph = buildRichExportGraph();
    const result = exportMspdi({
      graph: {
        ...graph,
        notes: [
          { activityKey: 'A1', body: 'Fish & <chips>' },
          { activityKey: 'A1', body: 'second' },
          { activityKey: 'wbs:100', body: 'on the summary' },
        ],
      },
    });
    if (!result.ok) throw new Error('export failed');
    expect(text(result.bytes)).toContain('Fish &amp; &lt;chips&gt;');
    const notes = taskNotes(result.bytes);
    expect(notes.get('wbs:100')).toBe('on the summary');
    // The parser leaves entities alone, so what it returns is the escaped text the file holds.
    expect(notes.get('A1')).toBe(`Fish &amp; &lt;chips&gt;${NOTE_JOINER}second`);
    expect(result.report.mapped.notes).toBe(3);
  });

  it('removes characters XML 1.0 forbids so the file still parses, and reports it', () => {
    const result = exportMspdi({
      graph: withNotes([{ activityKey: 'A1', body: 'bad\u0001byte\u000b here' }]),
    });
    if (!result.ok) throw new Error('export failed');
    expect(taskNotes(result.bytes).get('A1')).toBe('badbyte here');
    expect(result.report.approximations).toContainEqual(
      expect.objectContaining({
        entity: 'note',
        detail: 'characters XML 1.0 forbids were removed from the notes of 1 activity',
      }),
    );
  });

  it('reports the joining of several notes and the missing authors, in aggregate', () => {
    const result = exportMspdi({
      graph: withNotes(
        [
          { activityKey: 'A1', body: 'one' },
          { activityKey: 'A1', body: 'two' },
          { activityKey: 'A2', body: 'alone' },
        ],
        { planNoteCount: 1 },
      ),
    });
    if (!result.ok) throw new Error('export failed');
    const details = [...result.report.approximations, ...result.report.drops]
      .filter((f) => f.entity === 'note')
      .map((f) => f.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        '3 notes written as task notes; authors and dates are not written',
        'the notes of 1 activity were joined into one task note each, separated by a rule',
        '1 plan note was not written to the exported file',
      ]),
    );
  });

  it('round-trips one note exactly and joins several into one (FC-2)', () => {
    const graph = withNotes([
      ...TRICKY.slice(0, 6).map((body, i) => ({ activityKey: i === 0 ? 'A2' : 'A1', body })),
    ]);
    const exported = exportMspdi({ graph });
    if (!exported.ok) throw new Error('export failed');
    const back = importSchedule({ content: exported.bytes, filename: 'round.xml' });
    if (!back.ok) throw new Error('re-import failed');
    const codeOf = new Map(back.graph.activities.map((a) => [a.key, a.code]));
    const byCode = new Map<string, string[]>();
    for (const note of back.graph.notes ?? []) {
      const code = codeOf.get(note.activityKey) ?? '?';
      byCode.set(code, [...(byCode.get(code) ?? []), note.body]);
    }
    // One note on A2 comes back unchanged; five on A1 come back as ONE note holding all five.
    expect(byCode.get('A1010')).toEqual([TRICKY[0]]);
    expect(byCode.get('A1000')).toHaveLength(1);
    expect(byCode.get('A1000')?.[0]).toBe(TRICKY.slice(1, 6).join(NOTE_JOINER));
  });

  it('writes no <Notes> and no finding for a plan without notes, byte for byte', () => {
    const plain = exportMspdi({ graph: buildExportGraph() });
    const zero = exportMspdi({ graph: buildExportGraph({ planNoteCount: 0, notes: [] }) });
    if (!plain.ok || !zero.ok) throw new Error('export failed');
    expect(text(plain.bytes)).not.toContain('<Notes>');
    expect(text(zero.bytes)).toBe(text(plain.bytes));
    expect(zero.report).toEqual(plain.report);
  });
});
