import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * **A loading state is a skeleton, a gate or an action — and the build refuses a fourth kind.**
 * `docs/specs/loading-skeletons/spec.md` §4.8 (TECH_DEBT #234 + #341). Refusing by DECLARATION
 * (ADR-0124): a new `<Spinner` fails until somebody writes down which of the three it is, rather
 * than the gate guessing from context.
 *
 * - **G1** — every `<Spinner` render site is in a declared map. A spinner is right for a GATE (the
 *   answer decides which layout renders at all) and for an ACTION or COMPUTATION (a result the
 *   reader is waiting on). A first load whose settled shape is known gets a skeleton
 *   (`LoadingShape`), and until its milestone lands it sits in the `pending` bucket below.
 * - **G2** — `animate-pulse` appears in no `.tsx` outside `skeleton.tsx`. Three surfaces
 *   hand-rolled a pulsing block and bypassed the material; `docs/DESIGN_SYSTEM.md` forbids a
 *   one-off loading shape and nothing enforced it.
 * - **G3** — no `<Spinner` carries `aria-hidden`. The prop is silently dropped (the component
 *   accepts `{ className, label, labelOnScreen }` and TypeScript does not check hyphenated JSX
 *   attributes), so five sites announced a generic "Loading…" beside the sentence they meant to be
 *   the announcement. `labelOnScreen` is the supported way to put a sentence on screen.
 *
 * - **G4** — no `<Spinner>`, `<LoadingShape>` (unless `announce="none"`), `role="status"` or
 *   `aria-live` element sits inside an element carrying `aria-busy`, at a call site. ARIA 1.2 lets
 *   assistive technology defer changes inside a busy element, and a loading sentence unmounts before
 *   it stops being busy, so a status in there may never be spoken. Two route fallbacks did exactly
 *   this (`<main aria-busy>` around a `Spinner`) until the review of M1–M2 found them. This reads
 *   the JSX as written: a status rendered by a component the busy element merely contains (the
 *   `busy` prop of `SectionCard`) is not seen — those are guarded by the component's own tests.
 *
 * **The `pending` buckets are a declaration the epic must empty, not an exemption list that lives
 * on.** Each later milestone deletes its entries; M7's done-check is that all three (`PENDING_SPINNERS`,
 * `PENDING_PULSES`, `PENDING_BUSY`) are empty. The group
 * B/C maps are the permanent ones, and each entry carries its reason.
 *
 * **Its blind spot, stated.** A source-text scan sees `<Spinner` and `animate-pulse` as written; a
 * spinner built by a wrapper component, or a pulse composed from a computed class name, is not
 * seen. The fixture cases below prove the scanner finds what it claims to; they cannot prove
 * nothing else exists.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type Kind = 'gate' | 'action';
interface Declared {
  kind: Kind;
  sites: number;
  reason: string;
}

/** Group B (gate) and group C (action): the spinners that stay, each with why. */
const DECLARED: Record<string, Declared> = {
  'app/router.tsx': {
    kind: 'gate',
    sites: 2,
    reason: 'route-level guards/Suspense: the answer decides which layout renders',
  },
  'routes/forgot-password.tsx': {
    kind: 'gate',
    sites: 1,
    reason: 'signed in or not decides whether the form or a redirect renders',
  },
  'routes/audit-log.tsx': {
    kind: 'gate',
    sites: 1,
    reason: 'access decides whether the log or a refusal renders',
  },
  'routes/organization-export.tsx': {
    kind: 'gate',
    sites: 1,
    reason: 'access decides whether the export or a refusal renders',
  },
  'features/staff/ui/staff-console-screen.tsx': {
    kind: 'gate',
    sites: 1,
    reason:
      'must stay generic: anything console-shaped while pending would be the tell the uniform 404 forbids (ADR-0086, #459)',
  },
  'features/float-paths/components/FloatPathsPanel.tsx': {
    kind: 'action',
    sites: 1,
    reason: 'a computation the reader is waiting for, named by a visible verb',
  },
  'features/revision-compare/components/RevisionComparePanel.tsx': {
    kind: 'action',
    sites: 3,
    reason: 'a computation or a picker read the reader is waiting for, named by a visible verb',
  },
  'features/schedule-health/components/ScheduleHealthPanel.tsx': {
    kind: 'action',
    sites: 1,
    reason: 'a computation the reader is waiting for ("Checking the plan…")',
  },
  'features/interchange/components/ImportScheduleDialog.tsx': {
    kind: 'action',
    sites: 2,
    reason: 'parsing and importing are actions the reader started',
  },
  'features/staff/ui/diagnostics-panel.tsx': {
    kind: 'action',
    sites: 1,
    reason: 'the reader pressed Run diagnostics',
  },
};

/** Group A: first loads whose settled shape is known. Each milestone deletes its own entries. */
const PENDING_SPINNERS: Record<string, { sites: number; milestone: string }> = {
  'features/members/components/AcceptInvitationCard.tsx': {
    sites: 1,
    milestone: 'loading-skeletons M6',
  },
  'features/share/components/GuestPlanView.tsx': { sites: 1, milestone: 'loading-skeletons M6' },
};

/** G2: the hand-rolled pulses still to convert. Empty since M4. */
const PENDING_PULSES: Record<string, string> = {};

/** G4: the call sites whose spinner still sits inside `aria-busy`. Emptied by M6. */
const PENDING_BUSY: Record<string, string> = {
  'features/share/components/GuestPlanView.tsx': 'loading-skeletons M6',
};

/** The one file allowed to draw a pulsing block. */
const MATERIAL = 'components/ui/page/skeleton.tsx';

/** Comments name `<Spinner>` and `animate-pulse` to explain why they are not used. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Every `<Spinner …>` opening tag, brace-aware so an arrow in a prop does not end it early. */
function spinnerTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of code(source).matchAll(/<Spinner\b/g)) {
    const text = code(source);
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < text.length; end += 1) {
      const ch = text[end];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(text.slice(match.index, end + 1));
  }
  return tags;
}

/**
 * Statuses that sit inside an `aria-busy` element, found by walking the JSX tree. Returns one
 * description per offender. Parsing (not a regex) because "inside" is a tree property: a sibling
 * after the busy element's closing tag must not be reported.
 */
function statusesInsideBusy(source: string): string[] {
  const file = ts.createSourceFile(
    'x.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];

  const attrs = (node: ts.JsxOpeningLikeElement): ts.JsxAttribute[] =>
    node.attributes.properties.filter(ts.isJsxAttribute);
  const attr = (node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined =>
    attrs(node).find((a) => a.name.getText(file) === name);
  const literal = (a: ts.JsxAttribute | undefined): string | undefined =>
    a?.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : undefined;

  const isBusy = (node: ts.JsxOpeningLikeElement): boolean => {
    const a = attr(node, 'aria-busy');
    if (!a) return false;
    // `aria-busy={false}` is not a busy element.
    return !(
      a.initializer &&
      ts.isJsxExpression(a.initializer) &&
      a.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
    );
  };

  const speaks = (node: ts.JsxOpeningLikeElement): string | undefined => {
    const tag = node.tagName.getText(file);
    if (tag === 'Spinner') return '<Spinner>';
    if (tag === 'LoadingShape' && literal(attr(node, 'announce')) !== 'none')
      return '<LoadingShape>';
    if (literal(attr(node, 'role')) === 'status') return 'role="status"';
    if (attr(node, 'aria-live')) return 'aria-live';
    return undefined;
  };

  const openingOf = (node: ts.Node): ts.JsxOpeningLikeElement | undefined =>
    ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined;

  const scan = (node: ts.Node, busyAncestor: string | undefined): void => {
    const opening = openingOf(node);
    let busy = busyAncestor;
    if (opening) {
      const what = speaks(opening);
      if (busyAncestor && what) {
        const { line } = file.getLineAndCharacterOfPosition(opening.getStart(file));
        found.push(`${what} at line ${String(line + 1)} inside ${busyAncestor}`);
      }
      if (isBusy(opening)) {
        const { line } = file.getLineAndCharacterOfPosition(opening.getStart(file));
        busy = `<${opening.tagName.getText(file)} aria-busy> (line ${String(line + 1)})`;
      }
    }
    ts.forEachChild(node, (child) => {
      scan(child, busy);
    });
  };
  scan(file, undefined);
  return found;
}

const usesPulse = (source: string): boolean => /\banimate-pulse\b/.test(code(source));

describe('the scanners find what they claim to (pinned positive cases)', () => {
  it('counts a spinner and ignores one named in a comment', () => {
    const source = [
      '// A bare icon, not `<Spinner>`.',
      '/* and `<Spinner>` again */',
      'const a = <Spinner label="x" />;',
    ].join('\n');
    expect(spinnerTags(source)).toHaveLength(1);
  });

  it('reads past an arrow function inside a prop', () => {
    const tags = spinnerTags('<Spinner label={f(() => 1)} aria-hidden="true" />');
    expect(tags[0]).toContain('aria-hidden');
  });

  it('sees animate-pulse in code and not in a comment', () => {
    expect(usesPulse('<div className="animate-pulse" />')).toBe(true);
    expect(usesPulse('// we do not use animate-pulse here')).toBe(false);
  });
});

describe('G4: the busy-subtree scanner finds what it claims to (pinned positive cases)', () => {
  it('finds a spinner, a status and a speaking LoadingShape inside aria-busy', () => {
    const source = `
      const a = <main aria-busy="true"><Spinner label="Loading…" /></main>;
      const b = <div aria-busy={pending}><p><span role="status">x</span></p></div>;
      const c = <section aria-busy="true"><LoadingShape label="x"><i /></LoadingShape></section>;
    `;
    expect(statusesInsideBusy(source)).toHaveLength(3);
  });

  it('accepts a sibling, an announce="none" shape and aria-busy={false}', () => {
    const source = `
      const a = <><span role="status" /><main aria-busy="true"><Skeleton /></main></>;
      const b = <div aria-busy="true"><LoadingShape label="x" announce="none"><i /></LoadingShape></div>;
      const c = <div aria-busy={false}><Spinner label="x" /></div>;
    `;
    expect(statusesInsideBusy(source)).toEqual([]);
  });
});

describe('every loading spinner is declared', () => {
  const files = sourceFiles();
  const found = new Map<string, number>();
  for (const file of files) {
    const count = spinnerTags(readFileSync(file, 'utf8')).length;
    if (count > 0) found.set(relative(SRC, file), count);
  }

  it('scans a non-trivial number of files, so a broken walker cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(150);
    expect(found.size).toBeGreaterThan(10);
  });

  it('G1: finds no spinner outside the gate, action and pending declarations', () => {
    const undeclared = [...found.keys()].filter(
      (file) => !(file in DECLARED) && !(file in PENDING_SPINNERS),
    );
    expect(
      undeclared,
      `Declare each as a gate or an action in DECLARED (with the reason), or give it a skeleton:\n${undeclared.join('\n')}`,
    ).toEqual([]);
  });

  it('G1: every declaration still matches the tree', () => {
    const stale: string[] = [];
    for (const [file, declared] of Object.entries(DECLARED)) {
      const actual = found.get(file) ?? 0;
      if (actual !== declared.sites) {
        stale.push(`${file}: declared ${String(declared.sites)}, found ${String(actual)}`);
      }
    }
    for (const [file, declared] of Object.entries(PENDING_SPINNERS)) {
      const actual = found.get(file) ?? 0;
      if (actual !== declared.sites) {
        stale.push(
          `${file}: pending ${String(declared.sites)} (${declared.milestone}), found ${String(actual)} — delete the entry once its skeleton lands`,
        );
      }
    }
    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('G1: a site is declared once, as a keeper or as pending', () => {
    const both = Object.keys(DECLARED).filter((file) => file in PENDING_SPINNERS);
    expect(both).toEqual([]);
  });

  it('G3: no spinner carries aria-hidden', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const tag of spinnerTags(readFileSync(file, 'utf8'))) {
        if (/\baria-hidden\b/.test(tag)) offenders.push(`${relative(SRC, file)}: ${tag}`);
      }
    }
    expect(
      offenders,
      `<Spinner> drops aria-hidden silently; use label + labelOnScreen:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('G4: no status inside an aria-busy element', () => {
  const byFile = new Map(
    sourceFiles().map((file) => [
      relative(SRC, file),
      statusesInsideBusy(readFileSync(file, 'utf8')),
    ]),
  );

  it('finds none at any call site outside the pending bucket', () => {
    const offenders = [...byFile.entries()]
      .filter(([file]) => !(file in PENDING_BUSY))
      .flatMap(([file, found]) => found.map((o) => `${file}: ${o}`));
    expect(
      offenders,
      `Move the status outside the busy element (RoutePending's pattern) or drop aria-busy:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('every pending entry still has its offender, so the bucket cannot outlive its fix', () => {
    const gone = Object.keys(PENDING_BUSY).filter((file) => (byFile.get(file) ?? []).length === 0);
    expect(gone, `Delete from PENDING_BUSY:\n${gone.join('\n')}`).toEqual([]);
  });
});

describe('G2: a pulsing block comes from Skeleton', () => {
  const users = sourceFiles()
    .filter((file) => usesPulse(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file));

  it('finds the material itself, so the scan cannot pass vacuously', () => {
    expect(users).toContain(MATERIAL);
  });

  it('finds no other file that hand-rolls animate-pulse', () => {
    const others = users.filter((file) => file !== MATERIAL && !(file in PENDING_PULSES));
    expect(others, `Use <Skeleton> / <LoadingShape>:\n${others.join('\n')}`).toEqual([]);
  });

  it('every pending pulse is still there, so the bucket cannot outlive its fix', () => {
    const gone = Object.keys(PENDING_PULSES).filter((file) => !users.includes(file));
    expect(gone, `Delete from PENDING_PULSES:\n${gone.join('\n')}`).toEqual([]);
  });
});
