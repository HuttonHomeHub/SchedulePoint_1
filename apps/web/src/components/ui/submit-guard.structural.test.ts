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

/**
 * Every `<Button …>` opening tag, read to the `>` that **closes it** rather than to the first `>`
 * in the file.
 *
 * Two things defeat the obvious `/<Button\b[^>]*?>/`. This gate shipped already handling the
 * first and **not** the second:
 *
 * - **A comment inside the tag.** `CalendarFormDialog`'s submit carries a comment containing the
 *   words `<body>`, so a reader that does not strip comments stops there — and the attributes after
 *   it, including the class pair, become invisible. Six gates in this repository have now shipped a
 *   scan that matched or was truncated by their own prose; this file's docblock names the very
 *   attribute it forbids, so it would be the seventh.
 * - **An arrow function inside the tag.** `onClick={(event) => …}` puts a `>` at what looks like
 *   tag level, so a lazy match ends the tag **before** whatever follows the guard. Every site this
 *   gate exists for is written in exactly that shape, which is why the hole was invisible: the
 *   attribute it looks for happened to sit before the arrow at all ten sites. A `disabled=` written
 *   after one would have passed.
 *
 * So: strip comments, then track brace depth and break only on a `>` outside every expression.
 */
function buttonTags(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const tags: string[] = [];
  for (const match of code.matchAll(/<Button\b/g)) {
    const start = match.index;
    let depth = 0;
    let i = start;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(code.slice(start, i + 1));
  }
  return tags;
}

/** The submits this gate governs: a form's own submit that blocks itself during its mutation. */
function guardedSubmits(source: string): string[] {
  return buttonTags(source).filter(
    (tag) => tag.includes('type="submit"') && tag.includes('aria-disabled='),
  );
}

function nativeDisabledSubmits(source: string): string[] {
  return buttonTags(source).filter(
    (tag) => tag.includes('type="submit"') && /(?<!aria-)\bdisabled=/.test(tag),
  );
}

/**
 * **The half the first version of this gate could not see.**
 *
 * `Button`'s CVA base is `disabled:pointer-events-none disabled:opacity-50` — Tailwind's
 * `disabled:` variant, which fires on the **native attribute only**. So swapping to `aria-disabled`
 * removes the native attribute *and silently removes every visual consequence of it*: the button
 * stops dimming and stops being pointer-inert while its request is in flight, with nothing on
 * screen changing except the label.
 *
 * That is what this epic shipped at ten sites before a review caught it, and re-deriving found
 * **seven more that pre-dated it** — including all six public auth forms, where pressing Sign in
 * gave no feedback at all beyond the word. The gate proving the native attribute is absent was
 * asserting the easy half of a two-part rule.
 */
function unshadedSubmits(source: string): string[] {
  return guardedSubmits(source).filter(
    (tag) =>
      !tag.includes('aria-disabled:opacity') || !tag.includes('aria-disabled:pointer-events-none'),
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

    // The tag reader's holes, pinned as fixtures — and they are **not** the same fact, which is
    // worth stating rather than lumping. The arrow-function one was **live** in the shipped version
    // of this gate: run against the old `[^>]*?>` matcher it returns 0 where this returns 1. The
    // comment one already passed, because comment-stripping was there from the start; it is kept as
    // a regression pin on that stripping, not presented as a second defect found.
    expect(
      nativeDisabledSubmits(
        '<Button type="submit" onClick={(e) => e.preventDefault()} disabled={busy}>',
      ),
      'an arrow function inside the tag truncates the read and hides what follows it',
    ).toHaveLength(1);
    expect(
      nativeDisabledSubmits('<Button type="submit"\n// blurs to `<body>`\ndisabled={busy}>'),
      'a comment inside the tag truncates the read and hides what follows it',
    ).toHaveLength(1);

    expect(
      unshadedSubmits('<Button type="submit" aria-disabled={busy}>'),
      'the shading matcher no longer recognises a submit with no visual treatment',
    ).toHaveLength(1);
    expect(
      unshadedSubmits(
        '<Button type="submit" aria-disabled={busy} className="aria-disabled:pointer-events-none aria-disabled:opacity-60">',
      ),
      'the shading matcher fires on the correct shape',
    ).toHaveLength(0);
    expect(
      unshadedSubmits('<Button type="submit" disabled={busy}>'),
      'the shading matcher reaches a submit this gate already refuses for a different reason',
    ).toHaveLength(0);
  });

  it('shades every guarded submit, because `disabled:` utilities do not fire on `aria-disabled`', () => {
    const offenders = files.flatMap((file) => {
      const found = unshadedSubmits(readFileSync(file, 'utf8'));
      return found.map(() => relative(WEB_SRC, file).split(sep).join('/'));
    });

    expect(
      offenders,
      'add `className="aria-disabled:pointer-events-none aria-disabled:opacity-60"`: ' +
        "`Button`'s base carries `disabled:opacity-50`, which fires on the native attribute only, " +
        'so an `aria-disabled` submit with no `aria-disabled:` utility looks and behaves exactly ' +
        'as it does when idle while its request is in flight',
    ).toEqual([]);
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
