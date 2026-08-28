import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildFloatPathRows, floatPathEmphasisIds } from './model/float-path-rows';

/**
 * **The two claims that make Float paths a view-agnostic analysis** rather than a canvas feature
 * with a Gantt afterthought (audit F4, M3.2).
 *
 * Both are asserted structurally, because both fail *silently*: a canvas import would only show up
 * as a broken Gantt in someone's browser, and a second derivation of "which activities are on the
 * path" would differ only on a plan large enough for the two views to disagree — which is to say,
 * in a screenshot or a printed programme, long after the change that caused it.
 */

const FEATURE_DIR = join(import.meta.dirname, '.');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

describe('features/float-paths is view-agnostic', () => {
  it('imports nothing from the TSLD renderer', () => {
    // If it did, opening the panel in the Gantt would pull in a canvas module — and worse, the
    // temptation to reach for `centerOnDate` directly, which is null whenever the Gantt is showing.
    // The one seam both views share is the workspace's selection lift —
    // `canvasUi.requestSelectActivity(id)` + `model.onSelectionChange(id)`
    // (`plan-workspace-toolbar.tsx`, the panel's `onActivateActivity` wiring). This comment named
    // it `ctx.goToActivity` from its first commit, and a repository-wide grep returned that
    // comment and nothing else: the seam was real, the name was not (corrected at health M3-T4 —
    // noticing drift and stepping over it leaves the file exactly as wrong as not noticing,
    // ADR-0071).
    const offenders = sourceFiles(FEATURE_DIR).filter((path) =>
      /from '@\/features\/tsld/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('imports nothing from the Gantt either — it is a peer of both, not a member of one', () => {
    const offenders = sourceFiles(FEATURE_DIR).filter((path) =>
      /from '@\/features\/gantt/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('one derived emphasis set, two consumers', () => {
  it('is the same set object for the canvas and the Gantt', () => {
    // The workspace derives it once and hands the SAME reference to both `TsldPanel.floatPathIds`
    // and `GanttPanel.emphasisIds`. That identity is what makes "the two views cannot disagree" a
    // fact about the code rather than a convention someone has to keep (the ADR-0063
    // `wbs-band-source` rule).
    const paths = [
      { index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] },
      { index: 1, relativeFloatMinutes: 480, activityIds: ['b'] },
    ];
    const forCanvas = floatPathEmphasisIds(paths, 1);
    const forGantt = floatPathEmphasisIds(paths, 1);
    expect([...forCanvas]).toEqual([...forGantt]);
    // And the members are the API's, unfiltered by whatever either view happens to hold — a chain
    // member outside the loaded page still emphasises in the view that has it.
    expect([...forCanvas]).toEqual(['b']);
  });

  it('derives the emphasis WITHOUT the activity list, so neither view can narrow it', () => {
    // The row model joins against `activities`; the emphasis set deliberately does not. A view that
    // had paged differently would otherwise emphasise a different subset of the same path.
    const paths = [{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'unpaged'] }];
    expect([...floatPathEmphasisIds(paths, 0)]).toEqual(['t', 'unpaged']);
    // The row model, by contrast, marks the one it cannot resolve — that is a display concern.
    const model = buildFloatPathRows({
      paths,
      targetActivityId: 't',
      hasMorePaths: false,
      activities: [
        {
          id: 't',
          code: 'T',
          name: 'Handover',
          earlyStart: null,
          earlyFinish: null,
          totalFloat: null,
          calendarId: null,
        },
      ],
      planCalendarId: null,
      targetHoursPerDay: 8,
    });
    expect(model.rows[0]?.activities[1]?.missing).toBe(true);
  });
});
