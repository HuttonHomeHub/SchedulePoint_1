import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The minimap's three navigation routes commit through one implementation** (ADR-0100 M3;
 * the ADR-0065 `routeOrthogonal` rule): drag, click-to-jump and the keyboard all reach the
 * host's `minimapCenterOnWorld`/`minimapPanPages`, which are the ONLY callers of the pure
 * `centerOnWorld`/`pan` on the minimap's behalf. Two implementations of "centre the view
 * here" would agree the day they were written and drift after, and the drift would be
 * invisible — each route looks right alone.
 */
const COMPONENTS = import.meta.dirname;

describe('one minimap navigation commit', () => {
  const canvas = readFileSync(join(COMPONENTS, 'TsldCanvas.tsx'), 'utf8');
  const panel = readFileSync(join(COMPONENTS, 'TsldMinimap.tsx'), 'utf8');
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the pure centerOnWorld has exactly one call site in the host', () => {
    const calls = code(canvas).match(/[^.\w]centerOnWorld\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('the panel does no viewport arithmetic of its own', () => {
    // The panel maps its box pixels to world coordinates and hands them over; origin math is
    // the host's. A local `originX` write here would be the second implementation.
    for (const banned of ['originX', 'originY', 'viewRef']) {
      expect(code(panel), `TsldMinimap.tsx must not reference ${banned}`).not.toContain(banned);
    }
  });

  it('the commits touch the camera only — never the gesture machine or an open link pick', () => {
    // M3-T5(a): `dropLinkPickSignal` means "the bars are about to MOVE" — a data change. A pan
    // moves the camera; the pick is against an activity id and survives it. The commit
    // functions therefore reference none of the interaction machinery.
    const start = canvas.indexOf('const describeMinimapWindow');
    const end = canvas.indexOf('useImperativeHandle', start);
    const commits = canvas.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    for (const banned of ['gestureRef', 'pendingRef', 'dropLinkPick', 'assertHoldsPen']) {
      expect(commits, `the minimap commits must not touch ${banned}`).not.toContain(banned);
    }
  });
});
