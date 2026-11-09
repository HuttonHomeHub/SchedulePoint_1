import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The structure of the canvas selection in `TsldPanel`** (`docs/specs/canvas-multi-select/`).
 *
 * Two properties that no behavioural test would notice losing: there is exactly one selection
 * state, and `selectedId` is derived from it. This is a source assertion, deliberately — each
 * violation looks right in the running component and only shows as a one-frame disagreement.
 *
 * (A third assertion, that every plural reducer call sat behind `CANVAS_MULTI_SELECT_ENABLED`,
 * went with the flag when it retired: the plural path is the only path now.)
 */
const PANEL = readFileSync(join(import.meta.dirname, 'TsldPanel.tsx'), 'utf8');

/** The source with comments removed, so prose cannot satisfy or trip a pattern. */
const CODE = PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the canvas selection in TsldPanel', () => {
  it('holds exactly one selection state hook, so there is no second source of truth', () => {
    // Two selection states in one component is how a canvas and its own a11y layer end up
    // disagreeing about what is selected — and it would be invisible, because each looks right.
    const hooks = CODE.match(/useState<CanvasSelection>/g) ?? [];
    expect(hooks).toHaveLength(1);
  });

  it('derives selectedId rather than storing it', () => {
    // The alias is what keeps ~40 consumers untouched. If someone re-introduces a stored
    // `selectedId`, the two can drift for a frame — which is precisely the class of bug the
    // derived-not-effect rule exists to prevent.
    expect(CODE).toMatch(/const selectedId = selection\.primaryId;/);
    expect(CODE).not.toMatch(/useState<string \| null>\(null\);[\s\S]{0,40}selectedId/);
  });
});
