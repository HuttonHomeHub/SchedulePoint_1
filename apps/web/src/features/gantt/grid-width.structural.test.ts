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
 * than the compiler.
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
 * turns five cases red here. It cannot see the COMPONENT passing the wrong extra — reverting
 * `GanttPanel` to `ganttFixedWidth(COLUMNS, 0)`, which is the defect that shipped, leaves all 22
 * cases green. Only the browser assertion catches that, which is the whole argument of #151 in one
 * measurement.
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
   * The `vs baseline` column's width, and the reason this file now sweeps two values rather than
   * one.
   *
   * That column renders inside the pinned block when a baseline is active and is **not** a
   * `GanttColumn` — not sortable, not hideable, not in the vocabulary. So every assertion below
   * used to sum `columns` alone, which is precisely the arithmetic the product was getting wrong:
   * the pinned block summed to `pane + 72` at every width, and the column painted on top of the
   * chart. **This suite was green throughout.** A gate that sums only what it already knows about
   * agrees with the defect by construction, which is why the extra is now a parameter the compiler
   * makes every caller answer.
   *
   * 72 rather than an import: `VARIANCE_COLUMN_WIDTH` is module-private to `GanttPanel`, and the
   * number here is a fixture, not the source of truth — if the two ever disagree the browser-level
   * assertion in `e2e-gantt` is what says so.
   */
  const VARIANCE = 72;
  const EXTRAS: readonly (readonly [string, number])[] = [
    ['no baseline', 0],
    ['a baseline active', VARIANCE],
  ];

  it.each(
    SETS.flatMap((hidden) =>
      EXTRAS.map(
        ([state, extra]) =>
          [`${hidden.join(',') || '(nothing hidden)'}, ${state}`, hidden, extra] as const,
      ),
    ),
  )('fills the pane exactly at every width from the floor up — %s', (_label, hidden, extra) => {
    const columns = visible(hidden);
    const fixed = ganttFixedWidth(columns, extra);

    for (const pane of [fixed, fixed + 1, fixed + 96, 720]) {
      // `extra` is pinned content the column loop cannot see, so it is added here exactly as the
      // component renders it — beside the columns, inside the same block.
      const total = columns.reduce((sum, c) => sum + ganttColumnWidth(c, pane, fixed), extra);
      expect(
        total,
        `the pinned block sums to ${total} in a ${pane}px pane — ` +
          (total > pane ? 'it overflows onto the chart' : 'it leaves dead space'),
      ).toBe(pane);
    }
  });

  it.each(
    SETS.flatMap((hidden) =>
      EXTRAS.map(
        ([state, extra]) =>
          [`${hidden.join(',') || '(nothing hidden)'}, ${state}`, hidden, extra] as const,
      ),
    ),
  )('never lets the columns overflow below the floor either — %s', (_label, hidden, extra) => {
    const columns = visible(hidden);
    const fixed = ganttFixedWidth(columns, extra);

    // The floor is enforced by `useResizablePanelPrefs`' `min`, so a pane narrower than it should
    // be unreachable. Asserted anyway: if the floor is ever bypassed the columns must CLIP, which
    // is recoverable, rather than paint over the chart, which is the defect.
    const total = columns.reduce((sum, c) => sum + ganttColumnWidth(c, fixed - 200, fixed), extra);
    expect(total).toBe(fixed);
  });

  it('gives every extra pixel to the name column and none to the fixed ones', () => {
    const columns = visible(['predecessors']);
    const fixed = ganttFixedWidth(columns, 0);
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
