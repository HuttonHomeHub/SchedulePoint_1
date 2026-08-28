import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LABEL_FONT } from './geometry';

/**
 * **The painter's typeface is the product's typeface — derived, not remembered**
 * (`docs/TECH_DEBT.md` #173). `LABEL_FONT` named no real family for the whole life of the canvas:
 * it shipped as bare `system-ui` while the rest of the product was set first in Space Grotesk
 * (ADR-0097) and then in IBM Plex Sans (the workspace redesign, 2026-08-24) — so every activity
 * name, date label and lag chip on the primary surface was drawn in whatever the reader's machine
 * resolved, and even the register row raised about it went stale when the face changed underneath
 * it. This gate reads the family straight out of `--font-sans` in `globals.css`, so the NEXT face
 * change fails here instead of shipping a third era of the same defect. Verified red against the
 * `system-ui`-only constant.
 */
describe('LABEL_FONT', () => {
  it("leads with the product's own --font-sans family", () => {
    const css = readFileSync(join(__dirname, '../../../styles/globals.css'), 'utf8');
    const stack = /--font-sans:\s*\n?\s*'([^']+)'/.exec(css);
    expect(stack, 'globals.css declares --font-sans with a quoted leading family').not.toBeNull();
    expect(LABEL_FONT).toContain(`'${stack![1]!}'`);
  });
});
