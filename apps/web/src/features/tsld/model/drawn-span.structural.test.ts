import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Nothing that holds the API's `ActivitySummary` turns an early date into a canvas day.**
 *
 * Since ADR-0148 the canvas draws a bar at its effective-Visual dates. Seven places that reason about
 * that picture — Arrange, the reposition and duration nudges, the plural drag, the finish-edge
 * resize and the `n` prefill — converted `earlyStart`/`earlyFinish` to days instead, and every one
 * looked exactly like correct code, because the RENDER model names its drawn date `earlyStart`
 * too (`docs/TECH_DEBT.md` #372). So this gate is scoped by what a file HOLDS rather than by the
 * field name: `model/`, `interaction/` and `TsldPanel.tsx` work on `ActivitySummary`, where
 * `earlyStart` means the network's date; `render/` and the canvas components work on
 * `RenderActivity`, where it means the drawn one, and are deliberately outside the scan.
 *
 * Its blind spot is stated rather than hidden, and it was observed rather than supposed: the gate
 * matches `daysBetween(… .earlyStart/.earlyFinish)`, and `bulk-move.ts` seeded its move from
 * `activity.earlyStart` through `shiftIso` instead — so run against the pre-fix tree it went red on
 * **four** files (12 matches: `TsldPanel.tsx` 6, `use-coalesced-nudge.ts` 3, `arrange-lanes.ts` 2,
 * `use-coalesced-duration-nudge.ts` 1) and stayed green on the fifth. That file's cover is its own
 * unit case in `bulk-move.test.ts`. The first draft of this sentence said "ten matches across five
 * files", written before anything was counted. A file outside the scanned set that starts holding
 * `ActivitySummary` is invisible here too.
 *
 * **And the blind spot was then observed a second time, in the same fix.** `TsldPanel` passed its
 * `ActivitySummary` rows to `slackByDependencyId`, which does the early-date conversion inside
 * `render/geometry.ts` — outside the scan, fed from inside it — so the spoken link slack disagreed
 * with the canvas chip and this gate stayed green. It was found by the NetPoint-layout spec
 * reading the code, and is pinned by `TsldPanel.drawn-slack.test.tsx`, not by this file.
 */
const TSLD = join(import.meta.dirname, '..');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function sources(dir: string): string[] {
  return readdirSync(join(TSLD, dir))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(dir, f));
}

const SCANNED = [...sources('model'), ...sources('interaction'), 'components/TsldPanel.tsx'];
const EARLY_TO_DAY = /daysBetween\([^)]*\.early(?:Start|Finish)\b/g;

describe('drawn span, not early span', () => {
  it('scans a non-empty set that includes every file the defect lived in', () => {
    // Without this, a renamed directory would make the gate below pass by reading nothing.
    for (const f of [
      'model/arrange-lanes.ts',
      'model/bulk-move.ts',
      'interaction/use-coalesced-nudge.ts',
      'interaction/use-coalesced-duration-nudge.ts',
      'components/TsldPanel.tsx',
    ]) {
      expect(SCANNED).toContain(f);
    }
  });

  it.each(SCANNED)('%s converts no early date to a canvas day', (file) => {
    const hits = code(readFileSync(join(TSLD, file), 'utf8')).match(EARLY_TO_DAY) ?? [];
    expect(
      hits,
      'use drawnDaySpan (model/drawn-span.ts) — the canvas draws the effective-Visual dates',
    ).toEqual([]);
  });
});
