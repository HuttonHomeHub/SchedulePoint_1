import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Nothing in the TSLD feature turns an early date into a canvas day.**
 *
 * Since ADR-0148 the canvas draws a bar at its effective-Visual dates. Seven places that reason about
 * that picture — Arrange, the reposition and duration nudges, the plural drag, the finish-edge
 * resize and the `n` prefill — converted `earlyStart`/`earlyFinish` to days instead, and every one
 * looked exactly like correct code, because the RENDER model named its drawn date `earlyStart`
 * too (`docs/TECH_DEBT.md` #372). The render model now says `drawnStart`/`drawnFinish`, so the type
 * carries the distinction and this gate no longer has to be scoped by what a file HOLDS: it scans
 * every non-test source under the feature, and an `earlyStart` on the other side of a
 * `daysBetween(…)` is by construction the API's network date, which the canvas must not draw.
 *
 * Its blind spot is stated rather than hidden, and it was observed rather than supposed: the gate
 * matches `daysBetween(… .earlyStart/.earlyFinish)`, and `bulk-move.ts` seeded its move from
 * `activity.earlyStart` through `shiftIso` instead — so run against the pre-fix tree it went red on
 * **four** files (12 matches: `TsldPanel.tsx` 6, `use-coalesced-nudge.ts` 3, `arrange-lanes.ts` 2,
 * `use-coalesced-duration-nudge.ts` 1) and stayed green on the fifth. That file's cover is its own
 * unit case in `bulk-move.test.ts`. A second blind spot, `slackByDependencyId` converting inside
 * `render/geometry.ts` what `TsldPanel` fed it, is pinned by `TsldPanel.drawn-slack.test.tsx`; the
 * rename closes it as well, since that builder now accepts only `drawnStart`/`drawnFinish`.
 */
const TSLD = join(import.meta.dirname, '..');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function sources(dir: string): string[] {
  return readdirSync(join(TSLD, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return sources(rel);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

const SCANNED = sources('.');
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
