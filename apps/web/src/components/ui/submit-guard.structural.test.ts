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
/**
 * **The one file where `pointer-events-none` is wrong, named with its reason.**
 *
 * The discriminator is not in the tag and cannot be: **is the `aria-disabled` expression transient
 * — a mutation in flight — or can it be the control's resting state?** Sixteen of the seventeen
 * bind it to `mutation.isPending`, about a second, where inertness to the pointer is exactly right.
 * `ResendVerificationButton` binds `send.isPending || address.trim() === ''`, so on `/verify-email`
 * reached without `?email=` it is `aria-disabled` from first paint — and `pointer-events: none`
 * then makes `document.elementFromPoint` return the element **behind** it, so the only route back
 * into an unverified account is pointer-unreachable at rest.
 *
 * That is not hypothetical and is why this exception exists rather than a looser regex:
 * `e2e-public/public-screens.spec.ts` failed on it at all six viewports the first time this epic's
 * rule was applied to all seventeen. A tag scan cannot tell the two bindings apart, so the honest
 * instrument is a register somebody edits deliberately — the shape `dependency-claims.json` and
 * `flag-retirement.json` already use, and ADR-0083's "a named exception with its cost stated".
 *
 * **The cost is stated**: this button loses the pointer-inert half, and keeps its inertness from
 * `submit()`'s own `if (blocked) return;` one level up. Adding a second entry here should be hard,
 * so each one carries the reason it is not the transient case.
 */
const POINTER_EVENTS_EXEMPT = new Map([
  [
    'features/auth/components/ResendVerificationButton.tsx',
    '`aria-disabled` is a RESTING state (empty address), not a mutation in flight — ' +
      '`pointer-events: none` makes the primary action of /verify-email unreachable.',
  ],
]);

function unshadedSubmits(source: string, file = ''): string[] {
  const exempt = [...POINTER_EVENTS_EXEMPT.keys()].some((k) => file.endsWith(k));
  return guardedSubmits(source).filter((tag) => {
    if (!tag.includes('aria-disabled:opacity')) return true;
    return exempt ? false : !tag.includes('aria-disabled:pointer-events-none');
  });
}

/**
 * **The half the submit gate could not see: a RESTING `aria-disabled` that is pointer-inert**
 * (`docs/TECH_DEBT.md` #458).
 *
 * `aria-disabled:pointer-events-none` is right while a mutation is in flight and wrong at rest:
 * `pointer-events: none` makes `document.elementFromPoint` return whatever is **behind** the
 * control, so a button that is shaded from first paint cannot be hovered for its reason, and a
 * sighted pointer user gets neither the control nor an explanation. The submit gate above knows one
 * resting submit by name; this one reads every `<Button>`.
 *
 * **The discriminator is the expression bound to `aria-disabled`, and it is read, not guessed.**
 * Every `||` term must name a transient fact (`isPending`, `isFetchingNextPage`, `saving`, `running`,
 * `checking`, `refreshing`, `busy`, `submitting`, `loading`). A term that is anything else — `blocked`
 * (a local that folds a permission or a missing prerequisite in beside the pending flag), `!filtered`,
 * `result === undefined` — can be the control's resting state, so the site must either shade without
 * `pointer-events-none` or be a named exception that carries its reason and its register row.
 *
 * `Button`'s own `disabled:pointer-events-none` fires on the native attribute only, so the fix at a
 * resting site is `aria-disabled:opacity-60` and a handler guard that refuses — not the pointer class.
 */
const TRANSIENT_TERM =
  /^(?!!)[\w.?]*\b(isPending|isFetching\w*|isLoading|pending|saving|running|checking|refreshing|busy|submitting|loading)\b/;

/** The expression a `<Button>` binds to `aria-disabled`, or `null` where it binds none. */
function ariaDisabledExpression(tag: string): string | null {
  const at = tag.indexOf('aria-disabled=');
  if (at !== -1) {
    const open = tag.indexOf('{', at);
    if (open === -1 || open !== at + 'aria-disabled='.length) return 'true';
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
  // The spread idiom: `{...(isShown ? { 'aria-disabled': true } : {})}`. The condition is the fact.
  if (tag.includes("'aria-disabled'")) {
    return /\.\.\.\(\s*([^?]+?)\s*\?/.exec(tag)?.[1] ?? 'true';
  }
  return null;
}

function isTransient(expression: string): boolean {
  return expression.split('||').every((term) => TRANSIENT_TERM.test(term.trim()));
}

/** Every `<Button>` that is pointer-inert while shaded and whose shading can be its resting state. */
function restingPointerInert(source: string): string[] {
  return buttonTags(source).filter((tag) => {
    if (!tag.includes('aria-disabled:pointer-events-none')) return false;
    const expression = ariaDisabledExpression(tag);
    return expression !== null && !isTransient(expression);
  });
}

/**
 * **Named exceptions: sites outside the staff console that the gate found and this change did not
 * fix.** Each carries the register row that owns it and how many sites in the file it covers, so a
 * new site in the same file fails rather than hiding behind the entry. `docs/TECH_DEBT.md` #460 owns
 * the list; the staff console's own three sites were fixed in the change that wrote this gate.
 */
const RESTING_POINTER_INERT_EXCEPTIONS = new Map<string, { count: number; reason: string }>([
  [
    'components/ui/scope-save-bar.tsx',
    {
      count: 1,
      reason:
        '`blocked` folds `!gate.writable` and `!dirty` in beside `pending`: resting whenever the form is clean; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/audit/components/AuditEventList.tsx',
    {
      count: 1,
      reason:
        '`!query.hasNextPage` is the resting end of the list, not a request in flight; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/audit/components/AuditFilterBar.tsx',
    {
      count: 1,
      reason: '`empty` (no filter set) is a resting state of Clear; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/calendars/components/CalendarFormDialog.tsx',
    {
      count: 1,
      reason:
        '`blockedByOrgPermission` is a resting state for a reader without the permission; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/calendars/components/CalendarsTable.tsx',
    {
      count: 1,
      reason: '`!filtered` (no filter set) is a resting state of Clear; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/clients/components/ClientsTable.tsx',
    {
      count: 1,
      reason: '`!filtered` (no filter set) is a resting state of Clear; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/notes/components/NoteComposer.tsx',
    {
      count: 1,
      reason:
        '`emptyBody || overLimit` is a resting state of Post before anything is typed; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/notes/components/NoteItem.tsx',
    {
      count: 1,
      reason:
        '`emptyBody || overLimit` is a resting state of Save while the edit is unchanged; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/resources/components/ResourcesTable.tsx',
    { count: 1, reason: '`!filtersActive` is a resting state of Clear; docs/TECH_DEBT.md #460.' },
  ],
  [
    'features/tsld/components/ArrangeDialog.tsx',
    {
      count: 1,
      reason:
        '`blocked` includes `shadeReason !== null`, a resting refusal with a reason to read; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/tsld/components/BulkSelectionBar.tsx',
    {
      count: 1,
      reason:
        '`blocked` includes `!gate.enabled`, a resting refusal with a reason to read; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/tsld/components/CreateActivityPopover.tsx',
    {
      count: 1,
      reason:
        '`blocked` is a resting refusal with a reason to read, beside the transient `saving`; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/tsld/components/LinkChainDialog.tsx',
    {
      count: 1,
      reason:
        '`blocked` includes `refusal !== null`, a resting refusal with a reason to read; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/tsld/components/TsldPanel.tsx',
    {
      count: 1,
      reason:
        '`!editingEnabled` is the empty-canvas notice resting refusal when the plan is read-only; docs/TECH_DEBT.md #460.',
    },
  ],
  [
    'features/wbs/components/WbsBulkAssignBar.tsx',
    {
      count: 1,
      reason:
        '`blocked` includes `!gate.writable` and `changes.length === 0`, both resting; docs/TECH_DEBT.md #460.',
    },
  ],
]);

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

    // The exemption discriminates in BOTH directions, or it is a hole rather than a decision.
    const restingShape =
      '<Button type="submit" aria-disabled={blocked} className="aria-disabled:opacity-60">';
    expect(
      unshadedSubmits(restingShape, '/x/features/auth/components/ResendVerificationButton.tsx'),
      'the named exemption does not admit the shape it exists for',
    ).toHaveLength(0);
    expect(
      unshadedSubmits(restingShape, '/x/features/clients/components/ClientFormDialog.tsx'),
      'the exemption leaks to a file that never asked for it',
    ).toHaveLength(1);
  });

  // Every exemption names a real file, so a rename cannot leave a silent hole in the rule.
  it('every pointer-events exemption still exists', () => {
    for (const [key, reason] of POINTER_EVENTS_EXEMPT) {
      expect(
        files.some((f) => f.endsWith(key)),
        `${key} is exempt but no such file exists — delete the entry or fix the path`,
      ).toBe(true);
      expect(reason.length, `${key}'s exemption carries no reason`).toBeGreaterThan(40);
    }
  });

  it('shades every guarded submit, because `disabled:` utilities do not fire on `aria-disabled`', () => {
    const offenders = files.flatMap((file) => {
      const found = unshadedSubmits(readFileSync(file, 'utf8'), file);
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

  it('keeps a button that can rest aria-disabled pointer-reachable', () => {
    const found = new Map<string, number>();
    for (const file of files) {
      const hits = restingPointerInert(readFileSync(file, 'utf8')).length;
      if (hits > 0) found.set(relative(WEB_SRC, file).split(sep).join('/'), hits);
    }
    const unexpected = [...found].filter(
      ([path, count]) => count !== (RESTING_POINTER_INERT_EXCEPTIONS.get(path)?.count ?? 0),
    );
    expect(
      unexpected,
      'a `<Button>` shaded with `aria-disabled:pointer-events-none` whose expression can be true at ' +
        'rest: shade it with `aria-disabled:opacity-60` alone and refuse in the handler — or, for a ' +
        'site outside this change, add a named exception with a register row',
    ).toEqual([]);
    for (const [path, { count, reason }] of RESTING_POINTER_INERT_EXCEPTIONS) {
      expect(found.get(path), `${path} is excepted for ${String(count)} site(s) but has none`).toBe(
        count,
      );
      expect(reason.length, `${path}'s exception carries no reason`).toBeGreaterThan(40);
    }
  });
});
