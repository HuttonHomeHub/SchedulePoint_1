import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * **A lint warning is a failure** (ADR-0164, `docs/TECH_DEBT.md` #353). `react-hooks/exhaustive-deps`
 * is armed at `error` in `packages/config/eslint/react.js`, and every workspace lint script carries
 * `--max-warnings=0` — the rule that a warning of any kind fails `pnpm lint`, not only an error. This
 * file is the computed check that both halves stay true, plus the enforceable half of D5: every
 * `react-hooks/*` suppression in `apps/web` carries a written reason.
 *
 * Four assertions, per M2-T2 of the approved plan:
 *
 * 1. `exhaustive-deps` really is `error` in the **real, resolved config** for a real file — not
 *    read off the source text of `react.js`, which could say `error` while a later config layer
 *    (a `files` glob, an override, a future preset bump) quietly restored `warn`.
 * 2. Every workspace `package.json` with a `lint` script contains `--max-warnings=0`. The workspace
 *    list is **derived** by listing `apps/*` and `packages/*`, never hand-written (the ADR-0073 C4
 *    rule: a hard-coded roster drifts the moment a workspace is added or removed, silently).
 * 3. Every `eslint-disable(-next)?-line react-hooks/<rule>` directive in `apps/web` has a `-- reason`.
 *    Comments are the subject here, so scanning comments for this one rule is correct — the estate
 *    rule (`docs/DESIGN_SYSTEM.md`) is that a directive is a decision, and a decision written to get
 *    a red gate green without saying why is worse than the warning it silences (D5, #353 → #85).
 * 4. A **pinned positive case**: the directive scan finds at least 40 directives and the package scan
 *    finds exactly the 9 workspaces that declare a `lint` script. A scan that silently started
 *    finding nothing — a moved directory, a renamed script key, a regex that stopped matching —
 *    would pass every assertion above vacuously (the ADR-0093 / ADR-0108 lesson: "nothing found" and
 *    "nothing wrong" are not the same fact, and only a positive count tells them apart).
 */
const WEB_ROOT = join(import.meta.dirname, '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

/**
 * This file's own name, excluded from every scan below. Its fixture strings quote the directive
 * syntax verbatim (both with and without a reason, and the bare-prose false positive) to test the
 * matchers, which — being a `.ts` file under `src/` — is itself in the population the scan walks.
 * Without this exclusion the "no reason" fixture string counts as a real, reasonless directive and
 * fails the very assertion it exists to test.
 */
const SELF = import.meta.filename;

type PackageJson = { scripts?: Record<string, string> };

function readPackageJson(dir: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * `apps/*` and `packages/*`, listed rather than named. `packages/config` is a real workspace with
 * no `lint` script of its own (it IS the lint config), so it is filtered by the presence of the
 * script key below, not excluded by name here — excluding it by name would be the same hard-coded
 * roster this function exists to avoid.
 */
function workspaceDirs(): string[] {
  const dirs: string[] = [];
  for (const group of ['apps', 'packages']) {
    const groupPath = join(REPO_ROOT, group);
    for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(groupPath, entry.name));
    }
  }
  return dirs;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
  }
  return out;
}

/**
 * A real directive line, never a bare mention of the phrase. Requiring the literal `//` immediately
 * before `eslint-disable` — rather than matching the phrase anywhere in the file — is load-bearing:
 * `features/tsld/toolbar/commands/use-diagram-image.ts`'s own docblock names
 * `` `eslint-disable-next-line react-hooks/refs` `` in prose, inside a `*`-prefixed JSDoc line with
 * no `//` on it anywhere. A phrase-anywhere scan counts that sentence as a directive with no reason
 * and fails the gate on a file that suppresses nothing — the ADR-0124 "a claim is prose; a mention is
 * code" class, one rule along, and exactly the shape `docs/DESIGN_SYSTEM.md`'s own scan-matching-
 * prose gates have shipped six times already per that file's history.
 */
const DIRECTIVE_LINE = /\/\/\s*eslint-disable(?:-next)?-line\s+react-hooks\/[a-zA-Z-]+/;
const DIRECTIVE_LINE_WITH_REASON =
  /\/\/\s*eslint-disable(?:-next)?-line\s+react-hooks\/[a-zA-Z-]+\s*--\s*\S/;

/**
 * Every physical line in `source` that is a real `react-hooks` suppression directive, 1-indexed —
 * so an offender is reported as `file:line`, not merely `file`, which is what a reader actually
 * needs to go and fix it.
 */
function directiveLines(source: string): { line: number; text: string }[] {
  return source
    .split('\n')
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => DIRECTIVE_LINE.test(text));
}

describe('the lint policy is armed and its findings are enforced (ADR-0164, #353)', () => {
  it("react-hooks/exhaustive-deps is 'error' in the web workspace's real, resolved config", async () => {
    const eslint = new ESLint({ cwd: WEB_ROOT });
    const config = await eslint.calculateConfigForFile('src/main.tsx');
    const rule = config.rules?.['react-hooks/exhaustive-deps'];
    const severity = Array.isArray(rule) ? rule[0] : rule;

    expect(
      severity,
      'react-hooks/exhaustive-deps is not armed at error severity for a real file in this ' +
        'workspace — read from the resolved config, not the source of react.js, so a later ' +
        'override cannot quietly restore `warn` without this failing',
    ).toBe(2);
  });

  it('every workspace lint script refuses to pass while printing a warning', () => {
    const withLintScript = workspaceDirs()
      .map((dir) => ({ dir, pkg: readPackageJson(dir) }))
      .filter((entry): entry is { dir: string; pkg: PackageJson } =>
        Boolean(entry.pkg && typeof entry.pkg.scripts?.lint === 'string'),
      );

    const missing = withLintScript
      .filter((entry) => !(entry.pkg.scripts?.lint ?? '').includes('--max-warnings=0'))
      .map((entry) => relative(REPO_ROOT, join(entry.dir, 'package.json')));

    expect(
      missing,
      'a workspace lint script has lost --max-warnings=0, so a warning there would pass ' +
        '`pnpm lint` silently again — the exact failure ADR-0164 exists to close',
    ).toEqual([]);

    // Recorded here, not in the pinned positive case below: this assertion's own subject count.
    expect(
      withLintScript.length,
      'the workspace listing no longer finds any lint script at all',
    ).toBeGreaterThan(0);
  });

  it('every react-hooks suppression in apps/web states its reason', () => {
    const webSrc = join(WEB_ROOT, 'src');
    const offenders: string[] = [];

    for (const file of sourceFiles(webSrc)) {
      const source = readFileSync(file, 'utf8');
      for (const { line, text } of directiveLines(source)) {
        if (!DIRECTIVE_LINE_WITH_REASON.test(text)) {
          const path = relative(WEB_ROOT, file).split(sep).join('/');
          offenders.push(`${path}:${line}: ${text.trim()}`);
        }
      }
    }

    expect(
      offenders,
      'a `react-hooks` suppression with no ` -- reason` on its directive — write one at the call ' +
        'site (D5, ADR-0164): a suppression written to get lint green with nothing saying why is ' +
        'worse than the warning it silences',
    ).toEqual([]);
  });

  it('the scan finds the estate it is written to check', () => {
    // The pinned positive case (ADR-0093 / ADR-0108): "no offenders" passes identically whether the
    // scan found 44 clean directives or found nothing at all. Both counts are asserted here so a
    // moved directory, a renamed `lint` key, or a directive regex that stops matching turns this red
    // rather than leaving the three assertions above trivially, silently true.
    const withLintScript = workspaceDirs().filter((dir) =>
      Boolean(readPackageJson(dir)?.scripts?.lint),
    );
    expect(
      withLintScript.length,
      'expected exactly the 9 workspaces with a lint script (apps/api, apps/seed-cli, apps/web, ' +
        'packages/engine-conformance, packages/interchange, packages/layout, packages/seed, ' +
        'packages/seed-http, packages/types) — packages/config has none, by design',
    ).toBe(9);

    const totalDirectives = sourceFiles(join(WEB_ROOT, 'src')).reduce(
      (sum, file) => sum + directiveLines(readFileSync(file, 'utf8')).length,
      0,
    );
    expect(
      totalDirectives,
      'the directive scan found fewer than 40 react-hooks suppressions in apps/web — the matcher ' +
        'may no longer recognise the directive shape it exists to check',
    ).toBeGreaterThanOrEqual(40);

    // The reason-matcher recognises the shipped shape and rejects the ones it must reject.
    expect(
      DIRECTIVE_LINE_WITH_REASON.test(
        '    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open',
      ),
      'the reason matcher no longer recognises a directive that carries one',
    ).toBe(true);
    expect(
      DIRECTIVE_LINE_WITH_REASON.test(
        '    // eslint-disable-next-line react-hooks/exhaustive-deps',
      ),
      'the reason matcher passes a directive with no reason at all',
    ).toBe(false);
    expect(
      DIRECTIVE_LINE.test(
        "   * lets the register's second `eslint-disable-next-line react-hooks/refs` be deleted",
      ),
      'the directive matcher counts a bare prose mention (no leading `//`) as a real directive — ' +
        'exactly the use-diagram-image.ts false positive this file exists to avoid',
    ).toBe(false);
  });
});
