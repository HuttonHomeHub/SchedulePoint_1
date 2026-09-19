import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The forced-colors focus ring exists, and it is OUTSIDE every `@layer`.
 *
 * `docs/TECH_DEBT.md` #324: the house convention is `focus-visible:outline-none` plus a
 * `focus-visible:ring-*` box-shadow, 61 occurrences across 49 files, and `forced-colors: active`
 * suppresses `box-shadow` while leaving a native `outline` alone. Measured in Chromium against the
 * production build, focusing by keyboard, the focused control's screenshot is **byte-identical** to
 * the unfocused one — WCAG 2.2 §2.4.7, level A, on every focusable control in the product.
 *
 * **The layer is the whole remedy, which is why it is the assertion.** Tailwind v4 emits utilities
 * inside `@layer utilities`, so `.focus-visible\:outline-none:focus-visible` is a layered (0,2,0)
 * and the fix is an unlayered (0,1,0). An unlayered declaration beats every layered one whatever
 * its specificity — that is the only reason one bare rule can override 61 utility occurrences
 * without touching any call site. Moved into `@layer base`, where every other global rule in that
 * file lives and where a tidying reader would naturally put it, it **loses to `outline-none` on
 * every control**, silently, in a mode no other test here exercises.
 *
 * **Its blind spot, stated rather than left to be found.** This reads the SOURCE, so it proves the
 * author's intent and not the build's output. `apps/web/e2e-forced-colors/` is the half that runs a
 * real browser against the real bundle and compares pixels; this is the half that fails in CI in
 * three milliseconds and names the reason.
 */
const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8');

/** Strip comments first: this file's own subject is a rule, and the rule's docblock quotes it. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the forced-colors focus ring', () => {
  it('is declared at all', () => {
    // The pinned positive case (ADR-0093). Without it the layer assertion below passes perfectly
    // against a stylesheet that has no such rule, and a green run could not tell "correctly
    // unlayered" from "gone".
    expect(CODE).toMatch(/@media\s*\(\s*forced-colors:\s*active\s*\)/);
    expect(CODE).toMatch(/:focus-visible\s*\{[^}]*outline:/);
  });

  it('sits outside every @layer', () => {
    const at = CODE.search(/@media\s*\(\s*forced-colors:\s*active\s*\)/);
    expect(at, 'the rule is missing — see the case above').toBeGreaterThan(-1);

    // Walk to the rule counting braces, tracking which `@layer <name> {` blocks are open. A
    // depth-tracking walk rather than a regex, because `@layer base { … @media { … } … }` and
    // `@layer base { … } @media { … }` differ only in a brace hundreds of lines earlier.
    let depth = 0;
    const openLayers: { depth: number; name: string }[] = [];
    for (let i = 0; i < at; i += 1) {
      if (CODE.startsWith('@layer', i)) {
        let j = i;
        while (j < CODE.length && CODE[j] !== '{' && CODE[j] !== ';') j += 1;
        if (CODE[j] === '{') {
          openLayers.push({ depth, name: CODE.slice(i + 6, j).trim() });
          depth += 1;
        }
        i = j;
        continue;
      }
      if (CODE[i] === '{') depth += 1;
      else if (CODE[i] === '}') {
        depth -= 1;
        if (openLayers.length > 0 && openLayers[openLayers.length - 1]?.depth === depth) {
          openLayers.pop();
        }
      }
    }

    expect(
      openLayers.map((layer) => layer.name),
      'the forced-colors ring is inside a @layer, so Tailwind’s layered `outline-none` beats it and the ring never paints',
    ).toEqual([]);
  });

  it('uses a native outline, which is the one thing forced colours does not suppress', () => {
    const block = /@media\s*\(\s*forced-colors:\s*active\s*\)\s*\{([\s\S]*?)\n\}/.exec(CODE)?.[1];
    expect(block).toBeDefined();
    expect(block).toContain('outline:');
    // A box-shadow here would be the defect restated: `forced-colors` computes it to `none`
    // outright, so no amount of colour work reaches it.
    expect(block).not.toContain('box-shadow');
  });
});
