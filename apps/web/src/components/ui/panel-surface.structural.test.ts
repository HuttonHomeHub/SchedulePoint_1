import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The panel ground+border pairing is `PanelSurface`'s alone (TECH_DEBT #210).
 *
 * The pairing was a verbatim literal in four call sites and drifted once inside the very commit a
 * reviewer was reading (`app-shell.tsx`'s `#172` fix copied only the ground half). This gate fails
 * the fifth copy on the day it is written: no file may open a raw `<Surface tone="panel">` whose
 * own `className` carries an edge border. A raw `tone="panel"` WITHOUT a border stays legal — the
 * two `className="contents"` resizer scopes exist precisely because a border needs a box.
 *
 * Comments are stripped first (the fourth scan-matching-prose gate in this repository fixed
 * itself the same way), and the pinned positive asserts the four switched hosts actually import
 * the primitive — so the gate cannot pass vacuously against a world where `PanelSurface` vanished
 * (the ADR-0093 shape). Verified red 2026-08-28 against the pre-extraction tree, where the sweep
 * named all three host files.
 */
const WEB_SRC = join(__dirname, '..', '..');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function trackedSourceFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--', '*.tsx'], {
    cwd: WEB_SRC,
    encoding: 'utf8',
  });
  // `surface.tsx` is the one legal home of the pairing — it IS `PanelSurface`'s implementation.
  return out
    .split('\n')
    .filter((f) => f && !f.includes('.test.') && f !== 'components/ui/surface.tsx');
}

describe('PanelSurface owns the panel ground+border pairing', () => {
  it('no raw <Surface tone="panel"> carries its own edge border', () => {
    const offenders: string[] = [];
    for (const file of trackedSourceFiles()) {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      // Each raw panel Surface open tag: offend if its className holds border-r or border-l.
      const opens = source.match(/<Surface[\s\S]*?tone="panel"[\s\S]*?>/g) ?? [];
      for (const open of opens) {
        if (/border-[rl]\b/.test(open)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pinned positive: the three panel hosts import PanelSurface', () => {
    for (const host of [
      'components/layout/navigator/app-shell.tsx',
      'components/layout/navigator/explorer-column.tsx',
      'components/layout/drawer/context-drawer.tsx',
      // Found by this gate's own first run, not by the register: #210 said four sites and the
      // sweep named three more — the workspace's three right docks (ADR-0110's rule, again).
      'components/layout/workspace/plan-workspace-toolbar.tsx',
    ]) {
      const source = readFileSync(join(WEB_SRC, host), 'utf8');
      expect(source, `${host} must import PanelSurface`).toMatch(/\bPanelSurface\b/);
    }
  });
});
