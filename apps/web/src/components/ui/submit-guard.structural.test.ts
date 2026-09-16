import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **A control that blocks itself during its own mutation uses `aria-disabled`, never the native
 * `disabled` attribute.**
 *
 * `docs/DESIGN_SYSTEM.md:599-607` has said so by name for a long time, and the rule kept being
 * re-learnt instead of held: `docs/TECH_DEBT.md` #17(a) records it found again at ADR-0060 M6,
 * ADR-0063 M6 and ADR-0074 M2, each time in a different dialog, each time by a reviewer rather than
 * by anything automatic.
 *
 * The reason it matters is a sequence rather than a preference. A native `disabled` control is
 * removed from the tab order the instant the request starts and put back when it settles — so a
 * keyboard user pressing Enter on Save is thrown to `<body>` and then has to find their way back,
 * **twice per save**. `aria-disabled` shades and announces without leaving the tab order, and the
 * `onClick` guard is what actually prevents the double submit: react-hook-form's `handleSubmit` has
 * no re-entrancy guard of its own.
 *
 * **Verified red at ten sites** (page-consistency M5), re-derived rather than inherited — the spec
 * was briefed with eight and had missed `ShareLinksDialog` and `CreateOrganizationForm`.
 *
 * What it deliberately cannot see: a submit button whose `disabled` comes from a spread or a
 * variable, and a non-submit control that blocks itself the same way. Both are real holes, and
 * neither is worth a rule that reads arbitrary expressions — the shape this is written for is the
 * one that occurred ten times, which is an attribute written out in a tag.
 */
const WEB_SRC = join(import.meta.dirname, '..', '..');

/**
 * A form's submit is the case with a **precedent and a rule**. `disabled` on anything else —
 * an unloaded picker with nothing to read, a native `<select>` whose platform offers no
 * alternative — is a separate question ADR-0083 answers per control, and this gate deliberately
 * does not reach it.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

/** Every `<Button …>` opening tag, balanced to its `>` rather than read line by line. */
function buttonTags(source: string): string[] {
  // Comments first: this file's own docblock spells out the attribute it forbids, and six gates in
  // this repository have now shipped a scan that matched their own prose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/<Button\b[^>]*?>/gs)].map((m) => m[0]);
}

function nativeDisabledSubmits(source: string): string[] {
  return buttonTags(source).filter(
    (tag) => tag.includes('type="submit"') && /(?<!aria-)\bdisabled=/.test(tag),
  );
}

describe('a submit never blocks itself with the native attribute', () => {
  const files = sourceFiles(join(WEB_SRC, 'features')).concat(
    sourceFiles(join(WEB_SRC, 'components')),
    sourceFiles(join(WEB_SRC, 'routes')),
  );

  // The pinned positive case. "No file does X" passes perfectly against a walk that found no files
  // or a matcher that can no longer recognise X — ADR-0093's lesson, and ADR-0108's census gate
  // failed exactly this way on its first run.
  it('reads the tree and can still recognise the shape', () => {
    expect(files.length, 'the walk found no source files').toBeGreaterThan(200);
    expect(
      nativeDisabledSubmits('<Button type="submit" disabled={busy} aria-busy={busy}>'),
      'the matcher no longer recognises the shape it is written to catch',
    ).toHaveLength(1);
    expect(
      nativeDisabledSubmits('<Button type="submit" aria-disabled={busy} aria-busy={busy}>'),
      'the matcher fires on the correct shape',
    ).toHaveLength(0);
    expect(
      nativeDisabledSubmits('<Button type="button" disabled={loading}>'),
      'the matcher reaches past a submit into controls ADR-0083 answers separately',
    ).toHaveLength(0);
  });

  it('is nowhere in the estate', () => {
    const offenders = files.flatMap((file) => {
      const found = nativeDisabledSubmits(readFileSync(file, 'utf8'));
      return found.map(() => relative(WEB_SRC, file).split(sep).join('/'));
    });

    expect(
      offenders,
      'use `aria-disabled` plus an `onClick` guard — a native `disabled` submit leaves the tab ' +
        'order the instant the request starts and returns when it settles, throwing a keyboard ' +
        'user to `<body>` twice per save (`docs/DESIGN_SYSTEM.md` §Buttons)',
    ).toEqual([]);
  });
});
