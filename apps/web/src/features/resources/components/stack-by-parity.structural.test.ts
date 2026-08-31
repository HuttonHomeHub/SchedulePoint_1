import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **`Stack by` renders on BOTH surfaces, or on neither.**
 *
 * This register records the same defect five times: a correct pattern applied to a control and not
 * its neighbour (ADR-0064 §7, ADR-0067, ADR-0080's `bulk` wired into one host and not the layout
 * its flag selected, ADR-0114's `hostsDock`, ADR-0106's transient readout). It is invisible from
 * either side — each surface looks complete on its own — and it is exactly what would happen here,
 * because the dialog and the strip are different files edited at different times.
 *
 * A unit test cannot catch it either: each surface's own suite passes with the control absent from
 * the other. So the assertion is structural, over the two call sites.
 */
const SRC = join(import.meta.dirname, '../../..');
const SURFACES = [
  ['the histogram dialog', 'features/resources/components/ResourceHistogram.tsx'],
  ['the canvas strip panel', 'components/layout/workspace/resource-strip-panel.tsx'],
] as const;

describe('the Stack by control is on both surfaces or neither', () => {
  it.each(SURFACES)('%s renders StackByControl', (_where, file) => {
    const code = readFileSync(join(SRC, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).toContain('<StackByControl');
  });

  it('and both reach it through the SAME shared component', () => {
    // Not two look-alike selects. A second implementation would drift on its options, its label or
    // its disabled rule, and only somebody opening both surfaces would ever see it.
    for (const [, file] of SURFACES) {
      const code = readFileSync(join(SRC, file), 'utf8');
      expect(code).toMatch(/import\s*\{[^}]*StackByControl/);
    }
  });
});
