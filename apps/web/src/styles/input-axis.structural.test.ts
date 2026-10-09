import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { treeRowHeight } from '@/features/navigator/components/HierarchyTree';
import { declarations, readGlobalsCss } from '@/test/css-blocks';
import { SRC_DIR, allSourceFiles, stripComments } from '@/test/source-files';

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

/**
 * **The JS side of the axis** (dense-row-touch-targets, spec §5). The CSS half above has one
 * declaration site; the JS half had none, so a second component could ask for the pointer in its
 * own words and drift from `viewport-notice`'s. The rule is textual and deliberately blunt: any
 * `(pointer: …)` / `(any-pointer: …)` query in code — in a `matchMedia` literal, a constant that is
 * later passed to it (`const Q = '(pointer: coarse)'`), or a `[@media(pointer:…)]` class — is an
 * offender unless it is the right-hand side of the `COARSE_POINTER_QUERY` definition or is listed
 * below. `pointer-coarse:` is the utility that compiles to the same rule and is not matched.
 * Comments are stripped first, so `button.tsx`, `toolbar-styles.ts` and `GanttColumnEdge.tsx`
 * explaining the rule cannot break it.
 */
const POINTER_QUERY = /\(\s*(?:any-)?pointer\s*:[^)]*\)/g;
const COARSE_QUERY_DEFINITION = /COARSE_POINTER_QUERY\s*=\s*(['"`])[^'"`]*\1/g;

function pointerQueryCounts(): Map<string, number> {
  const found = new Map<string, number>();
  for (const file of allSourceFiles()) {
    const code = stripComments(readFileSync(join(SRC_DIR, file), 'utf8')).replace(
      COARSE_QUERY_DEFINITION,
      '',
    );
    for (const m of code.matchAll(POINTER_QUERY)) {
      const key = `${file}::${m[0]}`;
      found.set(key, (found.get(key) ?? 0) + 1);
    }
  }
  return found;
}

describe('the JS side of the input axis', () => {
  it('writes no pointer media query of its own', () => {
    const offenders = [...pointerQueryCounts()].map(([key, n]) => `${key} ×${n}`);
    expect(
      offenders,
      'a `(pointer: …)` query written out is a second vocabulary for the axis — use the ' +
        '`pointer-coarse:` utility in a class, or, in code, `useCoarsePointer()` from ' +
        '`components/ui/use-coarse-pointer.ts`, whose `COARSE_POINTER_QUERY` is the one definition',
    ).toEqual([]);
  });

  it('has exactly one definition of COARSE_POINTER_QUERY, and it is the hook module', () => {
    // The scan above blanks the right-hand side of a `COARSE_POINTER_QUERY = '…'` wherever it
    // appears, so a second definition elsewhere would be invisible to it.
    const definers = allSourceFiles().filter((file) =>
      new RegExp(COARSE_QUERY_DEFINITION.source).test(
        stripComments(readFileSync(join(SRC_DIR, file), 'utf8')),
      ),
    );
    expect(definers).toEqual(['components/ui/use-coarse-pointer.ts']);
  });

  it("gives the tree's coarse row height the coarse --control-h, so JS and CSS cannot disagree", () => {
    // The tree's rows are a number the virtualizer multiplies by, so they are the one control
    // height that cannot read the token. 2.75rem at the default root size is 44 px.
    const rem = Number.parseFloat(declarations(coarseBlockBody()).get('--control-h') ?? '');
    expect(treeRowHeight(true)).toBe(rem * 16);
  });
});
