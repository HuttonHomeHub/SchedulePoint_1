import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **No component or resolver may read a `--color-*` alias.** They must name the unprefixed token.
 *
 * `docs/TECH_DEBT.md` #159. An `@theme inline` alias is declared at `:root` as
 * `--color-primary: var(--primary)`, and a custom property's `var()` is substituted at
 * computed-value time **on the element that declares it** — so the already-substituted `:root` value
 * is what inherits, and a surface-scope rebind can never reach it. Verified in Chromium on a
 * four-line page rather than reasoned from the spec:
 *
 * ```
 * :root { --plot-primary: rgb(1,2,3); --primary: rgb(9,9,9); --color-primary: var(--primary); }
 * [data-surface="canvas"] { --primary: var(--plot-primary); }
 * → --primary at the scope        rgb(1,2,3)   (follows the rebind)
 * → --color-primary at the scope  rgb(9,9,9)   (frozen at :root)
 * ```
 *
 * **Tailwind utilities are unaffected, and that is why this survived so long.** `inline` is
 * precisely what makes `bg-primary` compile to `var(--primary)` instead of the alias, so every DOM
 * surface has always been correct. Only readers that *name* the alias — `getComputedStyle` calls and
 * hand-written inline styles — were wrong, and they were wrong silently: they resolve plausible
 * colours, pass every test, and look right to anyone not comparing two surfaces.
 *
 * It went unnoticed from the day surface scopes shipped until the light corporate theme gave the
 * page a navy `--primary` and the diagram a blue one. Then every non-critical bar painted navy, the
 * legend's "On schedule" swatch went near-black beside blue bars, and the guest share view — the one
 * screen a person outside the organisation sees — painted the page's whole family.
 *
 * **The contrast matrix is structurally incapable of reporting it.** `token-contrast.test.ts`
 * resolves a scope by reading the CSS text and following the rebind itself, so it asserts the
 * mapping the browser does not perform for alias readers: right about what the values should be,
 * silent about what the painter got. This gate is the missing half.
 *
 * Verified RED against the pre-fix tree: 88 reads in `render/palette.ts`, 38 inline styles in
 * `components/TsldLegend.tsx`, 18 var strings in the legend resolver and 3 in `TsldMinimap.tsx`.
 */

const SRC = resolve(__dirname, '..');

/**
 * The one legitimate exception, and it is narrow: `--canvas-minimap-frame` and its halo are a PACK
 * pair rather than a surface-family member. They are not rebound by any scope, so the alias and the
 * unprefixed name are the same value everywhere — and `token-contrast.test.ts` separately asserts
 * that both halves are reachable THROUGH `@theme inline`, which is the only reason the alias exists.
 * Naming the alias there is correct rather than tolerated.
 */
const ALIAS_EXEMPT = /^--color-canvas-minimap-frame(-halo)?$/;

function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

/**
 * Comments are stripped first, for the reason the two ratchets in `token-architecture.test.ts`
 * already record: a gate that scans raw text cannot tell a token being USED from one being
 * EXPLAINED, so documenting why a rule exists would count as breaking it — and the docblocks above
 * this line quote `--color-primary` four times.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('design tokens are read by their unprefixed name (structural)', () => {
  it('no source file names a --color-* alias', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const matches = [...code(file).matchAll(/--color-[a-z0-9-]+/g)].map((m) => m[0]);
      const bad = [...new Set(matches)].filter((name) => !ALIAS_EXEMPT.test(name));
      if (bad.length > 0) {
        offenders.push(`${relative(SRC, file).split('\\').join('/')}: ${bad.join(', ')}`);
      }
    }
    expect(
      offenders,
      'A `--color-*` alias is frozen at `:root` and cannot follow a surface rebind (TECH_DEBT #159).\n' +
        'Name the unprefixed token instead — `--primary`, not `--color-primary`.',
    ).toEqual([]);
  });

  it('the exemption is real: the minimap frame pair is not a rebound family member', () => {
    // If either half ever joins a scope's closure, the exemption becomes a hole and this fails —
    // which is the point of asserting it rather than trusting the comment above.
    const css = readFileSync(join(SRC, 'styles/globals.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const scopeBlocks = [...css.matchAll(/\[data-surface=['"][a-z]+['"]\]\s*\{([^}]*)\}/g)]
      .map((m) => m[1] ?? '')
      .join('\n');
    expect(scopeBlocks).not.toMatch(/--canvas-minimap-frame/);
  });
});
