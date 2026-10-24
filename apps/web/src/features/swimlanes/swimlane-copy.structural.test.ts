import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { allSourceFiles, SRC_DIR } from '@/test/source-files';

/**
 * **Copy never shortens "swimlane" to "lane"** (swimlanes feature-spec §3 rule 1; plan M2-T10).
 *
 * A swimlane is a labelled, contiguous run of lanes. In the product's words "lane" keeps its old
 * meaning — one row of the diagram — so a sentence that says "lane" and means a swimlane ("Add a
 * lane", "The lane is empty") teaches the planner a second meaning for a word the whole diagram
 * already uses. A lane inside a swimlane reads "lane 2 of 3" with the swimlane named beside it.
 *
 * **What is read:** the text a user can be shown — string literals, template strings and JSX text.
 * Comments and module specifiers are not copy, and a string that looks like a key (`NO_SWIMLANE`,
 * `swimlane-lanes`) is not a sentence. In a template, a substitution that is a number (`String(n)`, a
 * numeric literal, a `.length`) stands as `#` and any other as `§`.
 *
 * **Which files, derived and not listed:** every non-test file under `src/` is scanned, and any string
 * in it that names a swimlane is checked. That is the rule's own subject, so a new sentence about
 * swimlanes anywhere is covered without anyone adding it to a list. Two further sets are listed:
 * the files that speak only for swimlanes (all of their copy is checked), and files whose swimlane
 * sentences do not contain the word — checked only inside a declaration whose name says swimlane, so
 * the swimlane-free "lane 3" copy beside them is left alone.
 *
 * **What counts as bare:** any `lane`/`lanes` left after the qualified forms are masked, each a place
 * the word is true of a lane and not a swimlane: the C9 position "lane 2 of 3", a numeric count
 * ("3 lanes"), "free/next/remembered lane" (a row, in sentences that already name the swimlane),
 * "top/first/last/another lane of X", and "a lane in/inside/of a swimlane".
 */
const SWIMLANE_ONLY = [
  'features/tsld/render/swimlane-gutter.ts',
  'features/tsld/model/swimlane-lanes.ts',
  'features/tsld/model/swimlane-assignment.ts',
  'features/tsld/model/group-listbox.ts',
  'features/tsld/components/SwimlaneGutter.tsx',
  'features/tsld/components/MoveToSwimlaneControl.tsx',
  'features/tsld/components/MoveToSwimlaneButton.tsx',
] as const;

/** Files that carry swimlane sentences without the word; checked inside swimlane-named declarations. */
const BY_OWNER = [
  'features/tsld/model/reposition-announcement.ts',
  'features/tsld/render/a11y.ts',
  'features/tsld/interaction/use-swimlane-editing.ts',
  'features/plan-actions/selection-actions.tsx',
  'components/layout/workspace/activity-crud-dialogs.tsx',
  'components/layout/workspace/use-plan-workspace-model.ts',
  'features/undo-redo/commands.ts',
] as const;

/** The lane words that are about a lane, not a swimlane; each is replaced before the check. */
const QUALIFIED: readonly RegExp[] = [
  // The C9 position: "lane 2 of 3", "lane # of #".
  /\blane [\d#§] of\b/gi,
  // A numeric count: "3 lanes", "1 lane", "# lanes".
  /[\d#] lanes?\b/gi,
  // A row of a swimlane, in sentences that already name which.
  /\b(?:free|next|remembered) lanes?\b/gi,
  // Positional, and only with the swimlane it is a position in: "the top lane of Mechanical".
  /\b(?:top|first|last|another) lanes? of\b/gi,
  // "lane that way": the direction of a move, with the bar the sentence is about.
  /\blane that way\b/gi,
  // A lane that belongs to a swimlane, said as such.
  /\blanes? (?:in|inside|of) (?:a|its|their|the|each|every|that|this|§)? ?(?:swimlane|§)/gi,
];

/** The bare `lane` words left in `text`, after the qualified forms are taken out. */
export function bareLaneWords(text: string): string[] {
  let rest = text;
  for (const pattern of QUALIFIED) rest = rest.replace(pattern, ' ');
  return rest.match(/\blanes?\b/gi) ?? [];
}

export interface Copy {
  text: string;
  /** The names of the declarations the string sits inside, outermost first. */
  owners: string[];
}

const isNumeric = (e: ts.Expression): boolean =>
  ts.isNumericLiteral(e) ||
  (ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    /^(String|Number)$/.test(e.expression.text)) ||
  (ts.isPropertyAccessExpression(e) && e.name.text === 'length') ||
  (ts.isParenthesizedExpression(e) && isNumeric(e.expression)) ||
  (ts.isBinaryExpression(e) &&
    [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(e.operatorToken.kind));

/** A string that is a key and not a sentence: `NO_SWIMLANE`, `swimlane-lanes`. */
const KEY_LIKE = /^[A-Z_]+$|^[a-z-]+$|^[\w-]+:[§#\w-]*$/;

/** Every user-facing string in a source file, with the declarations around it. */
export function copyOf(source: string, fileName = 'x.tsx'): Copy[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const out: Copy[] = [];
  const visit = (node: ts.Node, owners: string[]): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return;
    let here = owners;
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyAssignment(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      here = [...owners, node.name.text];
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ text: node.text, owners: here });
    } else if (ts.isTemplateExpression(node)) {
      out.push({
        text:
          node.head.text +
          node.templateSpans
            .map((s) => `${isNumeric(s.expression) ? '#' : '§'}${s.literal.text}`)
            .join(''),
        owners: here,
      });
      node.templateSpans.forEach((s) => visit(s.expression, here));
      return;
    } else if (ts.isJsxText(node)) {
      out.push({ text: node.text, owners: here });
    }
    ts.forEachChild(node, (child) => visit(child, here));
  };
  visit(file, []);
  return out.filter((c) => c.text.trim() !== '' && !KEY_LIKE.test(c.text.trim()));
}

const read = (f: string): string => readFileSync(join(SRC_DIR, f), 'utf8');

/** Every string the rule applies to, as `file: text`. */
let memo: { file: string; text: string }[] | undefined;
function subjects(): { file: string; text: string }[] {
  if (memo) return memo;
  const all = allSourceFiles();
  const swimlaneOnly = new Set<string>([
    ...all.filter((f) => f.startsWith('features/swimlanes/')),
    ...SWIMLANE_ONLY,
  ]);
  const byOwner = new Set<string>(BY_OWNER);
  const out: { file: string; text: string }[] = [];
  for (const file of all) {
    // The test helpers and fixtures under `src/test` are not product copy.
    if (file.startsWith('test/')) continue;
    for (const c of copyOf(read(file), file)) {
      const applies =
        swimlaneOnly.has(file) ||
        /swimlane/i.test(c.text) ||
        (byOwner.has(file) && c.owners.some((o) => /swimlane/i.test(o)));
      if (applies) out.push({ file, text: c.text });
    }
  }
  memo = out;
  return out;
}

const texts = (source: string): string[] => copyOf(source).map((c) => c.text);

describe('swimlane copy never says a bare "lane"', () => {
  it('reads a real set of files, every named one of which exists', () => {
    const all = new Set(allSourceFiles());
    expect([...SWIMLANE_ONLY, ...BY_OWNER].filter((f) => !all.has(f))).toEqual([]);
    expect(all.size).toBeGreaterThan(500);
  });

  it('finds the copy it is meant to read', { timeout: 30_000 }, () => {
    const found = subjects().map((s) => s.text);
    // Both the C9 position and a swimlane sentence are in what it reads, so a parser that read
    // nothing cannot pass, and the derived scan reaches beyond the swimlanes feature.
    expect(found.some((t) => /lane # of #/.test(t))).toBe(true);
    expect(found.some((t) => /swimlane/i.test(t))).toBe(true);
    expect(
      subjects().some((s) => s.file === 'features/tsld/model/reposition-announcement.ts'),
    ).toBe(true);
  });

  it(
    'no string about a swimlane says a lane where it means a swimlane',
    { timeout: 30_000 },
    () => {
      const offenders = subjects()
        .filter((s) => bareLaneWords(s.text).length > 0)
        .map((s) => `${s.file}: ${s.text}`);
      expect(offenders).toEqual([]);
    },
  );

  it('refuses the sentences it exists to refuse', () => {
    for (const bad of [
      'Add a lane',
      'This lane is empty',
      'Delete lane “Civil”?',
      'Rename the lane',
      'Move to lane…',
      'Lanes',
      'Lane',
      'Moved to lane 2',
      'Moved to the first lane',
      'Back in the top lane',
      'Another lane',
      'Rename § lane',
    ]) {
      expect(bareLaneWords(bad), bad).not.toEqual([]);
    }
  });

  it('refuses them when they arrive as JSX text or a template, which is how they are written', () => {
    expect(texts('const c = <p>Lane</p>;').flatMap(bareLaneWords)).not.toEqual([]);
    expect(texts('const t = `Rename ${n} lane`;').flatMap(bareLaneWords)).not.toEqual([]);
    // A substitution that is not a number cannot make "§ lanes" a count.
    expect(texts('const t = `Delete ${name} lanes`;').flatMap(bareLaneWords)).not.toEqual([]);
  });

  it('accepts the forms where "lane" is true of a lane', () => {
    for (const good of [
      'Moved “Pour” to Mechanical, lane 2 of 3.',
      'Moved to §, lane # of #.',
      'Mechanical, swimlane 2 of 5, 14 activities, 3 lanes',
      'Already in the top lane of §.',
      'No free lane that way for “§”; it stays in §.',
      'Activities show under No swimlane, each in its remembered lane.',
      'It takes a lane in its swimlane.',
      'Back in its remembered lane',
    ]) {
      expect(bareLaneWords(good), good).toEqual([]);
    }
    expect(texts('const t = `${String(n)} lanes`;').flatMap(bareLaneWords)).toEqual([]);
  });

  it('reads template strings, JSX text and plain literals, and skips comments, imports and keys', () => {
    const source = [
      "import { x } from './swimlane-lanes';",
      '// Add a lane (a comment, not copy)',
      'const a = `Add a lane to ${name}`;',
      "const b = 'NO_SWIMLANE';",
      'const c = <p>Delete this lane</p>;',
      "const d = 'plain sentence here';",
    ].join('\n');
    expect(texts(source)).toEqual(['Add a lane to §', 'Delete this lane', 'plain sentence here']);
  });

  it('knows which declaration a string sits inside', () => {
    const copy = copyOf(
      "function swimlaneSays() { return () => 'lane 3 here'; }\nconst other = 'lane 3 there';",
    );
    expect(copy.map((c) => [c.text, c.owners.join('>')])).toEqual([
      ['lane 3 here', 'swimlaneSays'],
      ['lane 3 there', 'other'],
    ]);
  });
});
