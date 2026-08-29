import { describe, expect, it } from 'vitest';

import { declarations, readGlobalsCss } from '@/test/css-blocks';

/**
 * **The input axis, pinned** (ADR-0118 D2, built at M4 after the gate pass found it missing).
 *
 * `implementation-plan.md` M2-T1 required "a structural assertion that the override exists, names
 * only control-height tokens, and declares no colour (a colour there would escape the contrast
 * matrix entirely)". M2 shipped without it, and the architecture review found the omission by
 * searching the test tree for `pointer: coarse` and getting zero hits — so the block could have
 * been deleted, renamed, or given a colour, and nothing would have failed.
 *
 * **It also records what the surrounding gate cannot see**, which is the more useful half. ADR-0097
 * states that "a structural assertion forbids a design token being declared anywhere else", and
 * `css-blocks.ts` repeats it — but `token-architecture.test.ts`'s nearest assertion sweeps
 * `blockBody(':root')` only and filters values to `/^(oklch|rgb|hsl|#)/`, i.e. **colours**. So
 * `--control-h: 2.25rem` at `:root` was never covered either, and D2's framing ("a third kind of
 * declaration, named rather than left to be discovered") sat on a premise nobody had run. The
 * premise is corrected in the ADR; this file is the part of it that can fail.
 */
const COARSE_BLOCK = /@media\s*\(\s*pointer:\s*coarse\s*\)\s*\{\s*:root\s*\{([^}]*)\}/;

function coarseBlockBody(): string {
  const match = COARSE_BLOCK.exec(readGlobalsCss());
  if (!match?.[1]) {
    throw new Error(
      'globals.css has no `@media (pointer: coarse) { :root { … } }` block. ADR-0118 D2 is the ' +
        'ONLY place the input axis is declared — without it every control silently returns to its ' +
        'fine-pointer size on touch, and no unit test in this repository can see a control height.',
    );
  }
  return match[1];
}

describe('the coarse-pointer input axis', () => {
  it('exists, and is the one place the axis is declared', () => {
    expect(coarseBlockBody().trim()).not.toBe('');
  });

  it('re-values only control-height tokens', () => {
    const names = [...declarations(coarseBlockBody()).keys()].sort();
    // Set equality, not a subset: a token added here that is not a control height is a second
    // vocabulary hiding inside the axis, and a token REMOVED is half the axis silently gone.
    expect(names).toEqual(['--control-h', '--control-h-sm']);
  });

  it('declares no colour, which would escape the contrast matrix entirely', () => {
    // The contrast matrix resolves `:root` and the surface rebinds. It has no model of a media
    // block, so a colour declared here would be applied on every touch device and measured by
    // nothing — the ADR-0102 "the scope never reached the painter" shape, one axis over.
    for (const [name, value] of declarations(coarseBlockBody())) {
      expect(
        /^(oklch|rgb|hsl|#|color-mix)/.test(value.trim()),
        `\`${name}: ${value}\` is a colour, inside the input-axis block`,
      ).toBe(false);
    }
  });

  it('gives both tokens the house rule, in rem', () => {
    const decls = declarations(coarseBlockBody());
    // 2.75rem = 44px at the default root size. Asserted as the literal the file carries rather
    // than a computed pixel count, because jsdom resolves no stylesheet and there is nothing to
    // compute against — which is exactly why this axis needs a structural gate and not a unit one.
    expect(decls.get('--control-h')?.trim()).toBe('2.75rem');
    expect(decls.get('--control-h-sm')?.trim()).toBe('2.75rem');
  });
});
