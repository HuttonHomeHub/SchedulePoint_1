import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FONT_STACK } from '@/features/tsld/render/geometry';

/**
 * **The product's typeface reaches every layer that opts out of the cascade** — the canvas and the
 * print documents (`docs/specs/typeface-outward-artefacts/`).
 *
 * **The defect this was written for.** SchedulePoint is set in IBM Plex Sans, self-hosted, chosen
 * by the product owner on 2026-08-24 — and six sites set type by hand and received none of that
 * decision: `PrintSurface.css` and `GanttPrintSurface.css` both named **`'Inter'`**, a face with no
 * `@font-face` and no file in `src/assets/fonts/`, and the four export-band constants in
 * `render-export-image.ts` named bare `system-ui`. Measured under `emulateMedia({media:'print'})`,
 * `.tsld-print-container` resolved to Plex by inheritance while `.tsld-print-root` resolved to
 * `Inter` — so the decision **reached** the layer and the feature stylesheet overrode it away. The
 * diagram inside the exported picture was in the product's face and the band around it was not.
 *
 * **It is ADR-0102's seam, for type.** That ADR found `resolveTsldPalette` reading colour from an
 * element the surface rebind could never reach; this is the same shape one layer further out. A
 * layer that resolves nothing from the cascade has every cascade-level decision applied to it by
 * hand, and until this file nothing said so.
 *
 * **It subsumes `features/tsld/render/label-font.structural.test.ts`, which is deleted rather than
 * left beside it** — two gates over one rule is how they drift. That gate's own reasoning is
 * preserved: `LABEL_FONT` named no real family for the whole life of the canvas, and the register
 * row raised about it went stale when the face changed underneath it, which is why the family is
 * **derived from `--font-sans`** here rather than restated.
 *
 * ## What this gate CANNOT see — recorded so the next reader does not assume otherwise
 *
 * | Blind spot                                   | Why, and what covers it instead                                              |
 * | -------------------------------------------- | ---------------------------------------------------------------------------- |
 * | Anything outside `apps/web/src`              | Scoped there deliberately, to exclude the measurement harnesses that READ a   |
 * |                                              | computed `fontFamily` rather than set one. **This is live**: `public/`        |
 * |                                              | `favicon.svg` sets `system-ui` on the brand `S` and is a product-owner-       |
 * |                                              | approved named exception (one glyph, 16 px, in browser chrome).               |
 * | A Tailwind arbitrary-value class             | `font-['Foo']` in a `className` compiles to CSS this scan never reads.        |
 * | A dependency's stylesheet                    | Not ours to scan.                                                            |
 * | Whether the face actually **rendered**       | A missing woff2, a CSP block, a load race, an unrequested subset — all        |
 * |                                              | invisible to a text scan. `e2e-export` asserts the computed value in a real   |
 * |                                              | browser under print media; that is the instrument for this.                   |
 * | The size or the weight                       | Only the family. The type scale is `globals.css`'s and has its own rules.     |
 */
const WEB_SRC = join(process.cwd(), 'src');

/** Strip block and line comments — four gates in this repository have matched their own prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string, ext: readonly string[]): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
    (f) => ext.some((e) => f.endsWith(e)) && !f.includes('.test.'),
  );
}

/**
 * Sites that legitimately hand-set a family, keyed `file::substring` so an exemption can hide
 * exactly one thing (`control-height.structural.test.ts`'s shape, and for its reason: a file-level
 * exemption blinded that gate to the one file carrying the pattern it existed to enforce).
 */
const EXCEPTIONS = new Map<string, string>([
  [
    'styles/globals.css::@font-face',
    'the @font-face blocks NAME the faces being declared — that is the declaration itself',
  ],
  [
    "features/tsld/render/geometry.ts::'IBM Plex Sans', ui-sans-serif",
    'this IS `FONT_STACK` — the one place the family is spelled, which every other canvas font ' +
      'composes. Exempting the VALUE rather than the file keeps the rest of the leaf in scope, and ' +
      'assertion 1 independently pins this string against --font-sans, so a face changed here ' +
      'fails there rather than passing quietly',
  ],
]);

describe('the typeface reaches the layers that opt out of the cascade', () => {
  it('derives the canvas family from --font-sans rather than restating it', () => {
    const css = readFileSync(join(WEB_SRC, 'styles/globals.css'), 'utf8');
    const stack = /--font-sans:\s*\n?\s*'([^']+)'/.exec(css);
    expect(stack, 'globals.css declares --font-sans with a quoted leading family').not.toBeNull();
    expect(
      FONT_STACK,
      'FONT_STACK must lead with the product face, so the NEXT face change fails here rather than ' +
        'shipping a third era of the same defect',
    ).toContain(`'${stack![1]!}'`);
  });

  it('sets no canvas font by hand — every one composes FONT_STACK', () => {
    const offenders: string[] = [];
    for (const file of walk(WEB_SRC, ['.ts', '.tsx'])) {
      const code = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      // A canvas font shorthand ends in a family list; the tell is a generic family keyword or a
      // known system stack appearing in a string that is not built from FONT_STACK.
      //
      // **Three alternations, not one backreference over a shared class.** The first version was
      // `(['"`])([^'"`\n]*…)\1`, whose body excludes ALL quote characters — so it could not match
      // across the inner `'Segoe UI'` in `"600 16px system-ui, -apple-system, 'Segoe UI',
      // sans-serif"` and reported NONE of the four export-band constants this gate exists to catch.
      // It named only `FONT_STACK`'s own declaration, and would have gone green the moment that was
      // exempted: a gate blind to its own subject, passing for the wrong reason. Caught because the
      // plan requires the red run to name exactly the six known sites, rather than merely to be red.
      for (const m of code.matchAll(
        /"([^"\n]*\b(?:sans-serif|system-ui|-apple-system)\b[^"\n]*)"|'([^'\n]*\b(?:sans-serif|system-ui|-apple-system)\b[^'\n]*)'|`([^`\n]*\b(?:sans-serif|system-ui|-apple-system)\b[^`\n]*)`/g,
      )) {
        const text = m[1] ?? m[2] ?? m[3] ?? '';
        if (text.includes('${FONT_STACK}') || text.includes('FONT_STACK')) continue;
        if (
          [...EXCEPTIONS.keys()].some((k) => {
            const [f, needle] = k.split('::');
            return f === file && needle !== undefined && text.includes(needle);
          })
        )
          continue;
        offenders.push(`${file}: "${text.slice(0, 80)}"`);
      }
    }
    expect(
      offenders,
      'a hand-set canvas font cannot follow the product face — it can only agree with it until the ' +
        'face changes. Compose it from FONT_STACK, or add it to EXCEPTIONS with the reason.',
    ).toEqual([]);
  });

  it('sets no CSS family outside the one place that declares them', () => {
    const offenders: string[] = [];
    for (const file of walk(WEB_SRC, ['.css'])) {
      const code = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      for (const m of code.matchAll(/font-family:\s*([^;]+);/g)) {
        const value = (m[1] ?? '').replace(/\s+/g, ' ').trim();
        // `var(--font-sans)` / `var(--font-mono)` is the whole point: it follows the token.
        if (/^var\(--font-(sans|mono)\)$/.test(value)) continue;
        if (
          [...EXCEPTIONS.keys()].some((k) => {
            const [f, needle] = k.split('::');
            return f === file && needle !== undefined && code.includes(needle);
          })
        )
          continue;
        offenders.push(`${file}: font-family: ${value.slice(0, 70)}`);
      }
    }
    expect(
      offenders,
      'a stylesheet outside globals.css must read `var(--font-sans)` or `var(--font-mono)`. A named ' +
        'family here overrides the product face for that subtree, which is exactly how the two print ' +
        'stylesheets came to name `Inter` — a face this repository has no file for.',
    ).toEqual([]);
  });

  it('the authoring document names the face the product actually uses', () => {
    // **Prose has failed on this exact fact twice**, which is why it is gated rather than trusted.
    // `docs/DESIGN_SYSTEM.md` is what a reader consults before authoring, and it named `Inter`
    // through the Space Grotesk era and `Space Grotesk` through the IBM Plex era — wrong through
    // BOTH deliberate face decisions, on one page, in two places. A third change must fail here.
    //
    // **It parses the CLAIM rather than scanning for stale strings**, and the first version did the
    // latter and went red on its own correction notes — the sentences recording what the page used
    // to say contain the words it used to say. That is the fifth gate in this repository to match
    // its own prose, written two files after a docblock warning about exactly that. A rule stated
    // as "this document must not contain X" forbids the most useful sentence on the page: the one
    // explaining that X was wrong.
    const css = readFileSync(join(WEB_SRC, 'styles/globals.css'), 'utf8');
    const family = /--font-sans:\s*\n?\s*'([^']+)'/.exec(css)![1]!;
    const doc = readFileSync(join(process.cwd(), '../../docs/DESIGN_SYSTEM.md'), 'utf8');

    const claim = /\*\*The typeface is ([^*]+)\*\*/.exec(doc);
    expect(claim, 'docs/DESIGN_SYSTEM.md makes no "The typeface is …" claim at all').not.toBeNull();
    expect(
      claim![1]!.trim(),
      `docs/DESIGN_SYSTEM.md claims a typeface that is not the product's (${family})`,
    ).toContain(family);

    const familyBullet = /\*\*Family:\*\*[^\n]*(?:\n\s{2,}[^\n]*)*/.exec(doc);
    expect(familyBullet, 'docs/DESIGN_SYSTEM.md has no **Family:** bullet').not.toBeNull();
    expect(
      familyBullet![0],
      `the **Family:** bullet must name ${family} — it named a stale face through two decisions`,
    ).toContain(family);
  });

  it('every exception still matches code, with a reason', () => {
    // The pinned positive. Without it the assertions above pass just as happily against an
    // EXCEPTIONS map full of strings nothing matches — a list of permissions for code that has
    // gone, which is how an exception list quietly becomes a hole.
    for (const [key, reason] of EXCEPTIONS) {
      const [file, needle] = key.split('::');
      expect(file, `"${key}" is not in \`file::substring\` form`).toBeTruthy();
      expect(needle, `"${key}" is not in \`file::substring\` form`).toBeTruthy();
      const code = readFileSync(join(WEB_SRC, file as string), 'utf8');
      expect(code, `the exception "${key}" matches nothing any more`).toContain(needle as string);
      expect(reason.length, `"${key}" has no reason`).toBeGreaterThan(20);
    }
  });
});
