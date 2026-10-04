import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COLUMN_MAX,
  COLUMN_MIN,
  DEFAULT_COLUMN_WIDTHS,
  ganttColumnWidth,
  ganttFixedWidth,
  gridCeiling,
  isResizableKey,
  type ColumnWidths,
} from './layout/column-widths';
import { GANTT_COLUMNS } from './layout/grid-columns';

/**
 * **The grid pane's width is one number, and the columns exactly fill it** (Graphite M8-T1).
 *
 * `m8-gantt-split.md` states the acceptance condition in its own words: *"The three sites read one
 * value; a structural test says so."* This is that test, and it landed late — the M10 component
 * review found the criterion unmet, which is the ADR-0081 shape (a milestone's written acceptance
 * condition silently not met) occurring inside the epic running the gate pass.
 *
 * **What it protects.** ADR-0095 shipped `GRID_WIDTH` as a literal disagreeing with its own
 * columns, and the consequence was five columns painting on top of the bars — a picture that looks
 * authoritative and is wrong. Making that number draggable gives the same defect a wider blast
 * radius: every width between the floor and the ceiling is now reachable by a planner, not just the
 * handful the column set can produce. The first version of the splitter **reproduced it**, at a
 * 180 px floor I had guessed, and it was found by measuring in a browser rather than by any gate.
 * This is the gate that would have found it.
 *
 * **Per-column widths widen it again** (the resizable-columns epic, ADR-0173): every column's width
 * is now planner-reachable too, so the sweep below has a **widths axis** and the ceiling is the
 * floor-wins {@link gridCeiling} rather than the constant 720 it used to be.
 *
 * **What it deliberately does not claim.** It pins the arithmetic and the single source, not the
 * rendering: a site that ignored `resolveColumnWidth` and wrote its own `style={{ width }}` would
 * still be caught only by the text scans below, which are weaker than the compiler.
 *
 * **The browser-level proof now exists** (`docs/TECH_DEBT.md` #151, closed 2026-09-01):
 * `e2e-gantt/gantt.spec.ts` drives the separator to its floor and one step above it and asserts
 * that the pinned columns end exactly where the chart begins. This sentence used to say there was
 * none — and before that it said such proof "belongs to `e2e-gantt`", which is how a gap comes to
 * read as coverage held somewhere else.
 *
 * That journey immediately earned its place by finding a **live defect this file was green
 * against**: with a baseline active the pinned block summed to `pane + 72` at every width, because
 * `vs baseline` is not a `GanttColumn` and nothing here summed it. See {@link VARIANCE} below.
 *
 * **And the division of labour between the two is worth stating, because it was checked rather
 * than assumed.** This file pins the HELPER: dropping `extraPinnedWidth` from `ganttFixedWidth`
 * turns cases red here. It cannot see the COMPONENT passing the wrong extra — reverting
 * `GanttPanel` to `ganttFixedWidth(COLUMNS, widths, 0)`, which is the defect that shipped, leaves
 * every case green. Only the browser assertion catches that, which is the whole argument of #151 in
 * one measurement.
 */
describe('the Gantt grid width', () => {
  /**
   * Column sets a planner can actually produce. The default set is `predecessors` hidden (the
   * ADR-0059 parity contract); the others are what the M5 columns chooser can reach, including the
   * degenerate one-column case, which is where a floor derived by subtraction goes wrong first.
   */
  const SETS: readonly (readonly string[])[] = [
    ['predecessors'],
    [],
    ['predecessors', 'totalFloat'],
    ['predecessors', 'totalFloat', 'duration', 'earlyStart', 'earlyFinish'],
    ['predecessors', 'totalFloat', 'duration', 'earlyStart', 'earlyFinish', 'code'],
  ];

  const visible = (hidden: readonly string[]) =>
    GANTT_COLUMNS.filter((c) => !hidden.includes(c.key));

  /**
   * The `vs baseline` column's width, and the reason this file sweeps two values rather than one.
   *
   * That column renders inside the pinned block when a baseline is active and is **not** a
   * `GanttColumn` — not sortable, not hideable, not in the vocabulary. So every assertion below
   * used to sum `columns` alone, which is precisely the arithmetic the product was getting wrong:
   * the pinned block summed to `pane + 72` at every width, and the column painted on top of the
   * chart. **This suite was green throughout.** A gate that sums only what it already knows about
   * agrees with the defect by construction, which is why the extra is a parameter the compiler
   * makes every caller answer.
   *
   * 72 rather than an import, a fixture and not the source of truth — if the two ever disagree the
   * browser-level assertion in `e2e-gantt` is what says so.
   */
  const VARIANCE = 72;
  const EXTRAS: readonly (readonly [string, number])[] = [
    ['no baseline', 0],
    ['a baseline active', VARIANCE],
  ];

  const allAt = (width: number): ColumnWidths =>
    Object.fromEntries(Object.keys(DEFAULT_COLUMN_WIDTHS).map((key) => [key, width]));

  /**
   * The widths a planner can reach, not only the shipped ones. `all at the maximum` is the case the
   * constant 720 ceiling cannot hold: six columns at 400 need 2,520 px, so a pane clamped to 720 is
   * narrower than its own columns — ADR-0095's Float-over-chart incident, reachable by typing.
   */
  const WIDTHS: readonly (readonly [string, ColumnWidths])[] = [
    ['default widths', {}],
    ['all at the minimum', allAt(COLUMN_MIN)],
    ['all at the maximum', allAt(COLUMN_MAX)],
    ['one column at the maximum', { predecessors: COLUMN_MAX }],
  ];

  const CASES = SETS.flatMap((hidden) =>
    EXTRAS.flatMap(([state, extra]) =>
      WIDTHS.map(
        ([widthsLabel, widths]) =>
          [
            `${hidden.join(',') || '(nothing hidden)'}, ${state}, ${widthsLabel}`,
            hidden,
            extra,
            widths,
          ] as const,
      ),
    ),
  );

  it.each(CASES)(
    'fills the pane exactly at every width from the floor up — %s',
    (_label, hidden, extra, widths) => {
      const columns = visible(hidden);
      const fixed = ganttFixedWidth(columns, widths, extra);

      // The ceiling is `gridCeiling(fixed)`, the floor-wins rule: against the constant 720 the
      // all-max case puts the pane BELOW its own floor and the columns over the chart.
      for (const pane of [fixed, fixed + 1, fixed + 96, gridCeiling(fixed)]) {
        // `extra` is pinned content the column loop cannot see, so it is added here exactly as the
        // component renders it — beside the columns, inside the same block.
        const total = columns.reduce(
          (sum, c) => sum + ganttColumnWidth(c, widths, pane, fixed),
          extra,
        );
        expect(
          total,
          `the pinned block sums to ${total} in a ${pane}px pane — ` +
            (total > pane ? 'it overflows onto the chart' : 'it leaves dead space'),
        ).toBe(pane);
      }
    },
  );

  it.each(CASES)(
    'never lets the columns overflow below the floor either — %s',
    (_label, hidden, extra, widths) => {
      const columns = visible(hidden);
      const fixed = ganttFixedWidth(columns, widths, extra);

      // The floor is enforced by `useResizablePanelPrefs`' `min`, so a pane narrower than it should
      // be unreachable. Asserted anyway: if the floor is ever bypassed the columns must CLIP, which
      // is recoverable, rather than paint over the chart, which is the defect.
      const total = columns.reduce(
        (sum, c) => sum + ganttColumnWidth(c, widths, fixed - 200, fixed),
        extra,
      );
      expect(total).toBe(fixed);
    },
  );

  it('has a width for every column the grid draws, so no column quietly takes no room', () => {
    for (const column of GANTT_COLUMNS) {
      expect(
        column.key === 'name' || isResizableKey(column.key),
        `${column.key} is a grid column with no entry in DEFAULT_COLUMN_WIDTHS`,
      ).toBe(true);
    }
  });

  it('never puts the ceiling below the floor, for any sum the columns can reach', () => {
    for (const fixed of [120, 524, 686, 720, 721, 1000, 2520 + VARIANCE]) {
      expect(gridCeiling(fixed)).toBeGreaterThanOrEqual(fixed);
    }
  });

  it('gives every extra pixel to the name column and none to the fixed ones', () => {
    const columns = visible(['predecessors']);
    const widths: ColumnWidths = { code: 160 };
    const fixed = ganttFixedWidth(columns, widths, 0);
    const name = columns.find((c) => c.key === 'name')!;

    expect(
      ganttColumnWidth(name, widths, fixed + 200, fixed) -
        ganttColumnWidth(name, widths, fixed, fixed),
    ).toBe(200);
    for (const column of columns.filter((c) => c.key !== 'name')) {
      expect(ganttColumnWidth(column, widths, fixed + 200, fixed)).toBe(
        ganttColumnWidth(column, widths, fixed, fixed),
      );
    }
  });

  // Comments stripped, for the reason four other scanners in this repository record: a docblock
  // explaining why a value exists counted as *using* one, so writing the reasoning down pushed the
  // gate towards failing.
  const scan = (file: string): string =>
    readFileSync(join(process.cwd(), file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('routes every laid-out width through the one resolver', () => {
    const panel = scan('src/features/gantt/components/GanttPanel.tsx');
    const model = scan('src/features/gantt/layout/column-widths.ts');

    /**
     * A column's OWN width is an INPUT to the two pure helpers and must never reach a layout site.
     * Exactly two callers of `columnWidthOf`, both in the model, each named so a reader can tell a
     * legitimate third from the defect:
     *
     * 1. `ganttFixedWidth` — the splitter's floor;
     * 2. `ganttColumnWidth`'s non-`name` branch.
     *
     * (The pane's seed, `defaultGridWidth`, reads the DEFAULTS directly and deliberately cannot see
     * a planner's width: it is the framing input, and a column change must not rescale bars.)
     *
     * The panel calls it **never**: anything there is a column sizing itself against something
     * other than the pane, which is ADR-0095's incident restated. A count rather than a location
     * because the helpers move and the property does not.
     */
    expect(
      (panel.match(/\bcolumnWidthOf\(/g) ?? []).length,
      'GanttPanel.tsx called the intrinsic column width — lay out against the pane ' +
        '(`resolveColumnWidth`) instead',
    ).toBe(0);
    expect(
      // Minus the declaration.
      (model.match(/\bcolumnWidthOf\(/g) ?? []).length - 1,
      'a new caller of `columnWidthOf` appeared in column-widths.ts — it must be one of ' +
        '`ganttFixedWidth` and `ganttColumnWidth`',
    ).toBe(2);
  });

  it('feeds the zoom framing from the DEFAULT widths and nothing a planner set', () => {
    const panel = scan('src/features/gantt/components/GanttPanel.tsx');
    const measure = /setBarRegionWidth\(([^;]*)\)/.exec(panel);
    expect(measure, 'the bar-region measurement moved — re-point this scan').not.toBeNull();
    // A planner-aware input would rescale every bar on every frame of a column change (ADR-0173 D5).
    expect(measure![1]).toContain('DEFAULT_GRID_WIDTH');
    expect(measure![1]).not.toMatch(/gridWidth|FIXED_WIDTH|columnWidths/);
  });
});
