import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

function nativeDisabledSubmits(source: string): string[] {
  return buttonTags(source).filter(
    (tag) => tag.includes('type="submit"') && /(?<!aria-)\bdisabled=/.test(tag),
  );
}

/**
 * **A RESTING `aria-disabled` is never pointer-inert** (`docs/TECH_DEBT.md` #458, closed for the
 * fifteen sites by #460).
 *
 * `pointer-events-none` is right while a mutation is in flight and wrong at rest:
 * `pointer-events: none` makes `document.elementFromPoint` return whatever is **behind** the
 * control, so a button that is shaded from first paint cannot be hovered for its reason, and a
 * click on it lands on whatever is behind it. This gate reads every `<Button>`, and it is
 * **unconditional** — there is no register of exceptions, because the fifteen that once lived in one
 * were all fixed, and a rule with a way round it is the rule that got fifteen sites.
 *
 * **The discriminator is the expression bound to the state attribute, and it is read, not guessed.**
 * Every `||` term must name a transient fact (`isPending`, `isFetchingNextPage`, `saving`, `running`,
 * `checking`, `refreshing`, `busy`, `submitting`, `loading`). A term that is anything else — `blocked`
 * (a local that folds a permission or a missing prerequisite in beside the pending flag), `!filtered`,
 * `result === undefined` — can be the control's resting state. Two spellings are read:
 *
 * - `aria-disabled:pointer-events-none` reads the `aria-disabled` expression: only a transient one
 *   may carry it.
 * - `aria-busy:pointer-events-none` reads the `aria-busy` expression the same way. It is the remedy
 *   for a **mixed** site (a resting refusal AND a request in flight), so it is right exactly when
 *   `aria-busy` is bound to a transient fact, and a site that writes it with no `aria-busy` of its
 *   own, or one bound to a resting term, has the same defect under another name.
 *
 * `Button`'s own `disabled:pointer-events-none` fires on the native attribute only, and the shading
 * itself is the CVA's (`aria-disabled:opacity-60`), so the fix at a resting site is a handler guard
 * that refuses — not the pointer class.
 */
const TRANSIENT_TERM =
  /^(?!!)[\w.?]*\b(isPending|isFetching\w*|isLoading|pending|saving|running|checking|refreshing|busy|submitting|loading)\b/;

/** The `{…}` expression a `<Button>` binds to `attribute`, `'true'` for a bare one, or `null`. */
function attributeExpression(tag: string, attribute: string): string | null {
  const at = tag.indexOf(`${attribute}=`);
  if (at === -1) return null;
  const open = tag.indexOf('{', at);
  if (open === -1 || open !== at + attribute.length + 1) return 'true';
  let depth = 0;
  for (let i = open; i < tag.length; i += 1) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(open + 1, i).trim();
    }
  }
  return null;
}

/** The expression a `<Button>` binds to `aria-disabled`, or `null` where it binds none. */
function ariaDisabledExpression(tag: string): string | null {
  const bound = attributeExpression(tag, 'aria-disabled');
  if (bound !== null) return bound;
  // The spread idiom: `{...(isShown ? { 'aria-disabled': true } : {})}`. The condition is the fact.
  if (tag.includes("'aria-disabled'")) {
    return /\.\.\.\(\s*([^?]+?)\s*\?/.exec(tag)?.[1] ?? 'true';
  }
  return null;
}

function isTransient(expression: string): boolean {
  return expression.split('||').every((term) => TRANSIENT_TERM.test(term.trim()));
}

/** Every `<Button>` that is pointer-inert while its state can be a resting one. */
function restingPointerInert(source: string): string[] {
  return buttonTags(source).filter((tag) => {
    if (tag.includes('aria-disabled:pointer-events-none')) {
      const expression = ariaDisabledExpression(tag);
      if (expression !== null && !isTransient(expression)) return true;
    }
    if (tag.includes('aria-busy:pointer-events-none')) {
      const expression = attributeExpression(tag, 'aria-busy');
      if (expression === null || !isTransient(expression)) return true;
    }
    return false;
  });
}

/**
 * **G1 — the shaded look has one home, `components/ui/button.tsx`** (`docs/TECH_DEBT.md` #461).
 *
 * `Button`'s CVA owns `aria-disabled:opacity-60` and the gated hover. A caller that spells either
 * wins over the CVA through `cn`, which is how forty-odd sites drifted between 50 and 60 and kept
 * a hover fill on a shaded control. Whole-file rather than per-tag: a constant (the old
 * `SHADED_BUTTON`) is exactly the spelling a tag reader cannot see.
 */
const SHADED_SPELLING = /aria-disabled:(opacity-|hover:)/;

/**
 * Files that legitimately spell it, each for a reason. Not `<Button>` callers: they do not inherit
 * the CVA, so the spelling there is the only shading they have.
 */
const SHADED_SPELLING_ALLOWED: Readonly<Record<string, string>> = {
  'components/ui/button.tsx': 'the CVA that owns the shaded state',
  'components/ui/radio-card-group.tsx':
    'a RadioCard is a labelled input, not a Button (out of scope)',
  'features/revision-compare/components/RevisionComparePanel.tsx':
    'a raw <button> row that never inherits the Button CVA',
  'features/revision-compare/components/RevisionChangesView.tsx':
    'a raw <button> row that never inherits the Button CVA',
};

function allSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

/** Source with block comments and whole-line or trailing `//` comments removed. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function spellsShadedLook(source: string): boolean {
  return SHADED_SPELLING.test(stripComments(source));
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

  it('classifies the aria-disabled expression the way a reader would', () => {
    const pe = 'className="aria-disabled:pointer-events-none aria-disabled:opacity-60"';
    expect(restingPointerInert(`<Button aria-disabled={save.isPending} ${pe}>`)).toHaveLength(0);
    expect(
      restingPointerInert(`<Button aria-disabled={a.isPending || b.isFetchingNextPage} ${pe}>`),
    ).toHaveLength(0);
    expect(
      restingPointerInert(`<Button aria-disabled={result === undefined} ${pe}>`),
      'a resting expression with the pointer class must be found',
    ).toHaveLength(1);
    expect(
      restingPointerInert(
        `<Button aria-disabled={!query.hasNextPage || query.isFetchingNextPage} ${pe}>`,
      ),
      'one resting term makes the whole expression resting-capable',
    ).toHaveLength(1);
    expect(
      restingPointerInert(`<Button aria-disabled={blocked} ${pe}>`),
      'a local named blocked can fold a prerequisite in beside the pending flag',
    ).toHaveLength(1);
    expect(
      restingPointerInert(
        `<Button {...(isShown ? { 'aria-disabled': true } : {})} ${pe} onClick={() => {}}>`,
      ),
      'the spread idiom is read through to its condition',
    ).toHaveLength(1);
    expect(
      restingPointerInert(
        '<Button aria-disabled={result === undefined} className="aria-disabled:opacity-60">',
      ),
      'a resting control that is shaded without the pointer class is the remedy',
    ).toHaveLength(0);
  });

  it('classifies the aria-busy expression of a mixed site the same way', () => {
    const busy = 'className="aria-busy:pointer-events-none aria-disabled:opacity-60"';
    expect(
      restingPointerInert(`<Button aria-disabled={blocked} aria-busy={save.isPending} ${busy}>`),
      'a mixed site protected by a transient aria-busy is the remedy',
    ).toHaveLength(0);
    expect(
      restingPointerInert(`<Button aria-disabled={blocked} aria-busy={blocked} ${busy}>`),
      'an aria-busy bound to a resting term is the same defect under another name',
    ).toHaveLength(1);
    expect(
      restingPointerInert(`<Button aria-disabled={blocked} ${busy}>`),
      'the busy pointer class with no aria-busy of its own protects nothing and is found',
    ).toHaveLength(1);
  });

  it('keeps a button that can rest aria-disabled pointer-reachable', () => {
    const found: string[] = [];
    for (const file of files) {
      const hits = restingPointerInert(readFileSync(file, 'utf8')).length;
      if (hits > 0) found.push(`${relative(WEB_SRC, file).split(sep).join('/')} (${String(hits)})`);
    }
    expect(
      found,
      'a `<Button>` shaded with `aria-disabled:pointer-events-none` whose expression can be true at ' +
        'rest: drop the pointer class and refuse in the handler (for a submit, in `onClick` AND ' +
        '`onSubmit`) — or, if the site also has a request in flight, use `aria-busy:pointer-events-none` ' +
        "bound to that request's flag",
    ).toEqual([]);
  });
});

describe('G1: the shaded look is spelled in one place', () => {
  const toPath = (file: string): string => relative(WEB_SRC, file).split(sep).join('/');

  it('is spelled by no caller outside the allow-list', () => {
    const offenders = allSourceFiles(WEB_SRC)
      .filter((file) => !(toPath(file) in SHADED_SPELLING_ALLOWED))
      .filter((file) => spellsShadedLook(readFileSync(file, 'utf8')))
      .map(toPath);

    expect(
      offenders,
      '`Button` owns `aria-disabled:opacity-60` and the gated hover: delete the caller spelling ' +
        '(a caller string wins over the CVA through `cn`, and that is how 50 and 60 drifted)',
    ).toEqual([]);
  });

  it('recognises the spellings, constants included, and ignores a comment', () => {
    expect(spellsShadedLook("const X = 'aria-disabled:opacity-50';")).toBe(true);
    expect(spellsShadedLook("const X = 'aria-disabled:hover:bg-background';")).toBe(true);
    expect(
      spellsShadedLook('<Button className="aria-disabled:pointer-events-none">'),
      "the pointer class is the caller's to keep",
    ).toBe(false);
    expect(spellsShadedLook('// was aria-disabled:opacity-50\nconst X = 1;')).toBe(false);
    expect(spellsShadedLook('/* aria-disabled:opacity-50 */\nconst X = 1;')).toBe(false);
  });

  it('allows only files that still exist', () => {
    const stale = Object.keys(SHADED_SPELLING_ALLOWED).filter(
      (file) => !existsSync(join(WEB_SRC, file)),
    );
    expect(stale, 'an allow-listed file was moved or deleted: remove its entry').toEqual([]);
    expect(
      existsSync(join(WEB_SRC, 'components/ui/not-a-file.tsx')),
      'the existence check can no longer tell a missing file',
    ).toBe(false);
  });

  it('gives every allow-list entry a reason', () => {
    for (const [file, reason] of Object.entries(SHADED_SPELLING_ALLOWED)) {
      expect(reason.length, file).toBeGreaterThan(10);
    }
  });
});
