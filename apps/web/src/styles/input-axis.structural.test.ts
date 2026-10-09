import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * **The JS side of the axis, and the arbitrary-variant spelling** (dense-row-touch-targets, spec
 * §5). The CSS half above has one declaration site; the JS half had none, so a second component
 * could ask `matchMedia('(pointer: coarse)')` in its own words and drift from `viewport-notice`'s.
 * Scope is deliberately narrow: only a STRING LITERAL passed to `matchMedia(` / `useMediaQuery(`
 * that mentions `pointer` — an identifier argument (`COARSE_POINTER_QUERY`) is the sanctioned form
 * and is not matched — and no class string spelled `[@media(pointer:…)]`, because `pointer-coarse:`
 * is the utility that compiles to the same rule and that `control-height.structural.test.ts` reads.
 * Comments are stripped first, so `button.tsx`, `toolbar-styles.ts` and `GanttColumnEdge.tsx`
 * explaining the rule cannot break it.
 */
const SRC_DIR = join(process.cwd(), 'src');

const POINTER_QUERY_LITERAL = /(?:matchMedia|useMediaQuery)\(\s*(['"`])([^'"`]*pointer[^'"`]*)\1/g;
const ARBITRARY_POINTER_VARIANT = /\[@media\(pointer:/g;

/**
 * Sites that predate `COARSE_POINTER_QUERY` (created at M2 of the same epic). Each line is removed
 * by the milestone that moves the site onto the hook; none may be added.
 */
const INTERIM = new Set<string>([
  "components/layout/viewport-notice/viewport-notice.tsx::'(pointer: coarse)'",
  'features/navigator/components/HierarchyTree.tsx::[@media(pointer:',
]);

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function pointerAxisOffenders(): string[] {
  const offenders: string[] = [];
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.') && !f.includes('.spec.'))
    .map((f) => f.split('\\').join('/'));
  for (const file of files) {
    const code = strip(readFileSync(join(SRC_DIR, file), 'utf8'));
    for (const m of code.matchAll(POINTER_QUERY_LITERAL)) {
      const key = `${file}::${m[1]}${m[2]}${m[1]}`;
      if (!INTERIM.has(key)) offenders.push(key);
    }
    for (const _ of code.matchAll(ARBITRARY_POINTER_VARIANT)) {
      const key = `${file}::[@media(pointer:`;
      if (!INTERIM.has(key)) offenders.push(key);
    }
  }
  return offenders;
}

describe('the JS side of the input axis', () => {
  it('is asked only through COARSE_POINTER_QUERY, and never as a [@media(pointer:…)] class', () => {
    expect(
      pointerAxisOffenders(),
      'a `pointer` media query written as a literal is a second vocabulary for the axis — use ' +
        '`COARSE_POINTER_QUERY` / `pointer-coarse:` (ADR-0118 D2, dense-row-touch-targets)',
    ).toEqual([]);
  });

  it('still finds each interim site, so the allowance cannot outlive the code', () => {
    // The pinned positive: an INTERIM line matching nothing is a permission for code that has gone.
    for (const key of INTERIM) {
      const [file, needle] = key.split('::');
      const code = strip(readFileSync(join(SRC_DIR, file as string), 'utf8'));
      expect(code, `the interim allowance "${key}" matches nothing any more`).toContain(
        needle as string,
      );
    }
  });
});
