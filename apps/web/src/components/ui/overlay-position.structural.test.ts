import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The viewport clamp and the top-layer portal target exist ONCE, in `overlay-position.ts`
 * (TECH_DEBT #203(b), fix-slice M-C).
 *
 * `usePopoverPanel` carried a second, estimate-only copy of the clamp — and #196a's Escape fix
 * had to be made per copy, with the third copy missed for two days. This gate fails the next
 * copy: outside the leaf, no source file may declare a `CLAMP_MARGIN` of its own or compute the
 * viewport-minus-box clamp arithmetic. Comments are stripped before scanning (the recurring
 * scan-matching-prose hole), and the pinned positive asserts both adopters import the leaf, so
 * the gate cannot pass vacuously against a world where the leaf vanished (ADR-0093's shape).
 *
 * Verified red 2026-08-28 against the pre-extraction tree, where it named `menu.tsx` and
 * `toolbar/use-popover-panel.tsx`.
 */
const WEB_SRC = join(__dirname, '..', '..');
const LEAF = 'components/ui/overlay-position.ts';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function trackedSourceFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--', '*.ts', '*.tsx'], {
    cwd: WEB_SRC,
    encoding: 'utf8',
  });
  return out.split('\n').filter((f) => f && !f.includes('.test.') && f !== LEAF);
}

describe('overlay-position owns the viewport clamp', () => {
  it('no file outside the leaf declares its own clamp', () => {
    const offenders: string[] = [];
    for (const file of trackedSourceFiles()) {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      if (
        /const CLAMP_MARGIN\s*=/.test(source) ||
        /window\.innerWidth\s*-\s*\w+\s*-\s*CLAMP_MARGIN/.test(source)
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The ceiling must not be derived from the overlay's own clamped `top` — that loop is what
   * `overlayMaxHeight`'s docblock records shipping (a WBS summary's row menu putting `Dissolve`
   * and `Delete` below the fold, in the mechanism written to keep them reachable). A scan, not a
   * type: the shape is an expression, and the compiler cannot see one. Comment-stripped, because
   * the two consumers now DOCUMENT the forbidden expression to explain why they do not use it —
   * the fourth scan-matching-prose trap in this repository.
   */
  it('no overlay derives its height ceiling from its own clamped top', () => {
    const offenders: string[] = [];
    for (const file of trackedSourceFiles()) {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      if (/window\.innerHeight\s*-\s*top\b/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('pinned positive: the two clamped overlays take the ceiling from the leaf', () => {
    for (const host of ['components/ui/menu.tsx', 'components/ui/toolbar/use-popover-panel.tsx']) {
      const source = stripComments(readFileSync(join(WEB_SRC, host), 'utf8'));
      expect(source, `${host} must call overlayMaxHeight()`).toMatch(/overlayMaxHeight\(\)/);
    }
  });

  it('pinned positive: every overlay host imports the leaf', () => {
    for (const host of [
      'components/ui/menu.tsx',
      'components/ui/toolbar/use-popover-panel.tsx',
      // The third adopter (fix-slice M-B). Added by the M-B component review's blocking finding:
      // the gate existed to pin "no third copy" and was not asserting the third consumer.
      'components/ui/tooltip.tsx',
    ]) {
      const source = readFileSync(join(WEB_SRC, host), 'utf8');
      expect(source, `${host} must import from overlay-position`).toMatch(
        /from '@\/components\/ui\/overlay-position'/,
      );
    }
  });
});
