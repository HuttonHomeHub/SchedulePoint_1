import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The close guard for native-`<dialog>` primitives exists ONCE (TECH_DEBT #197 item 1).
 *
 * `Dialog` and `Sheet` carried private copies of `closeIfSelf`, and the copies had already
 * diverged — `confirmBeforeClose` landed on one and not the other. This gate fails the next
 * private copy on the day it is written: no file under `components/ui` other than the leaf may
 * compare a close event's target against a dialog ref.
 *
 * Comments are stripped before scanning, so a docblock DESCRIBING the guard (this repository has
 * shipped four scan-matching-prose gates) cannot trip it. And the gate carries a pinned positive —
 * both primitives import the leaf — so it cannot pass vacuously against a world where the guard
 * vanished entirely (the ADR-0093 shape: a green suite must distinguish "one copy" from "none").
 *
 * Verified red 2026-08-28 against the pre-extraction tree (both `dialog.tsx` and `sheet.tsx` held
 * `event.target !== ref.current`).
 */
const UI_DIR = join(__dirname);
const LEAF = 'native-dialog-close.ts';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('native-dialog-close is the one close guard', () => {
  it('no ui file outside the leaf compares a close target against a ref', () => {
    const offenders: string[] = [];
    for (const name of readdirSync(UI_DIR, { recursive: true }) as string[]) {
      if (!/\.(ts|tsx)$/.test(name) || name.includes('.test.')) continue;
      if (name.endsWith(LEAF)) continue;
      const source = stripComments(readFileSync(join(UI_DIR, name), 'utf8'));
      if (/event\.target\s*!==\s*(ref|[A-Za-z]+Ref)\.current/.test(source)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('pinned positive: both native-dialog primitives import the leaf', () => {
    for (const primitive of ['dialog.tsx', 'sheet.tsx']) {
      const source = readFileSync(join(UI_DIR, primitive), 'utf8');
      expect(source, `${primitive} must import useNativeDialogClose`).toMatch(
        /from '@\/components\/ui\/native-dialog-close'/,
      );
    }
  });
});
