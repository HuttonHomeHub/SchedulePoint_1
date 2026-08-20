import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ganttColumnWidth, ganttFixedWidth } from './components/GanttPanel';
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
 * **What it deliberately does not claim.** It pins the arithmetic and the single source, not the
 * rendering: a site that ignored `resolveColumnWidth` and wrote its own `style={{ width }}` would
 * still be caught only by the second assertion below, which is a text scan and therefore weaker
 * than the compiler. **And there is no browser-level proof at all**: nothing in `e2e-gantt` or
 * `e2e-gantt-editing` drives the splitter, the pane width or a column resize — checked, not
 * assumed, after this sentence first read that such proof "belongs to `e2e-gantt`", which is how a
 * gap comes to read as coverage held somewhere else. The arithmetic is pinned; the picture is not.
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

  it.each(SETS.map((hidden) => [hidden.join(',') || '(nothing hidden)', hidden] as const))(
    'fills the pane exactly at every width from the floor up — %s',
    (_label, hidden) => {
      const columns = visible(hidden);
      const fixed = ganttFixedWidth(columns);

      for (const pane of [fixed, fixed + 1, fixed + 96, 720]) {
        const total = columns.reduce((sum, c) => sum + ganttColumnWidth(c, pane, fixed), 0);
        expect(
          total,
          `columns sum to ${total} in a ${pane}px pane — ` +
            (total > pane ? 'they overflow onto the chart' : 'they leave dead space'),
        ).toBe(pane);
      }
    },
  );

  it.each(SETS.map((hidden) => [hidden.join(',') || '(nothing hidden)', hidden] as const))(
    'never lets the columns overflow below the floor either — %s',
    (_label, hidden) => {
      const columns = visible(hidden);
      const fixed = ganttFixedWidth(columns);

      // The floor is enforced by `useResizablePanelPrefs`' `min`, so a pane narrower than it should
      // be unreachable. Asserted anyway: if the floor is ever bypassed the columns must CLIP, which
      // is recoverable, rather than paint over the chart, which is the defect.
      const total = columns.reduce((sum, c) => sum + ganttColumnWidth(c, fixed - 200, fixed), 0);
      expect(total).toBe(fixed);
    },
  );

  it('gives every extra pixel to the name column and none to the fixed ones', () => {
    const columns = visible(['predecessors']);
    const fixed = ganttFixedWidth(columns);
    const name = columns.find((c) => c.key === 'name')!;

    expect(ganttColumnWidth(name, fixed + 200, fixed) - ganttColumnWidth(name, fixed, fixed)).toBe(
      200,
    );
    for (const column of columns.filter((c) => c.key !== 'name')) {
      expect(ganttColumnWidth(column, fixed + 200, fixed)).toBe(
        ganttColumnWidth(column, fixed, fixed),
      );
    }
  });

  it('routes every laid-out width through the one resolver', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/gantt/components/GanttPanel.tsx'),
      'utf8',
    )
      // Comments stripped, for the reason four other scanners in this repository record: a docblock
      // explaining why a value exists counted as *using* one, so writing the reasoning down pushed
      // the gate towards failing.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    /**
     * The intrinsic width is an INPUT to the two pure helpers and must never reach a layout site.
     * Three callers exactly, and each is named so a reader can tell a legitimate fourth from the
     * defect:
     *
     * 1. the `GRID_WIDTH` sum — the seed `useResizablePanelPrefs` defaults from;
     * 2. `ganttFixedWidth`, which is the splitter's floor;
     * 3. `ganttColumnWidth`'s non-`name` branch.
     *
     * Anything else is a column sizing itself against something other than the pane, which is
     * ADR-0095's incident restated. This is a count rather than a location because the helpers move
     * and the property does not; a fourth caller fails here and the failure message says why.
     */
    expect(
      (source.match(/\bcolumnWidth\(/g) ?? []).length,
      'a new caller of the intrinsic column width appeared in GanttPanel.tsx — ' +
        'lay out against the pane (`resolveColumnWidth`) instead',
    ).toBe(3);
  });
});
