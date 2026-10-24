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
 * **What is read:** the text a user can be shown — string literals, template strings (with each
 * `${…}` standing as `§`) and JSX text — in the files that speak for swimlanes. Comments and module
 * specifiers are not copy. A string with no space is a key, not a sentence.
 *
 * **What counts as bare:** any `lane`/`lanes` left after the qualified forms are masked. The masks are
 * the whole of what is allowed, each one a place the word is true of a lane and not a swimlane:
 * the C9 position "lane 2 of 3", a count ("3 lanes"), "top/free/next/remembered lane" (a row, in the
 * sentences that already say which swimlane), and "a lane in/inside/of a swimlane".
 *
 * It reads the roster below, not "every file": the planner's own `lane` copy elsewhere (the
 * swimlane-free drag, the table) is correct and must stay so. A file that starts speaking for
 * swimlanes is added to the roster, and the roster test keeps it from silently emptying.
 */
const ROSTER_EXTRA = [
  'features/tsld/render/swimlane-gutter.ts',
  'features/tsld/model/swimlane-lanes.ts',
  'features/tsld/model/swimlane-assignment.ts',
  'features/tsld/model/group-listbox.ts',
  'features/tsld/components/SwimlaneGutter.tsx',
  'features/tsld/components/MoveToSwimlaneControl.tsx',
  'features/tsld/components/MoveToSwimlaneButton.tsx',
] as const;

const rosterFiles = (): string[] => {
  const all = allSourceFiles();
  return [...all.filter((f) => f.startsWith('features/swimlanes/')), ...ROSTER_EXTRA];
};

/** The lane words that are about a lane, not a swimlane; each is replaced before the check. */
const QUALIFIED: readonly RegExp[] = [
  // The C9 position: "lane 2 of 3", "lane § of §", "lane § of Mechanical".
  /\blane (?:\d+|§) of\b/g,
  // A count: "3 lanes", "1 lane", "§ lanes".
  /(?:\d+|§) lanes?\b/g,
  // A row of a swimlane, in sentences that already name which: "the top lane of Mechanical".
  /\b(?:top|free|next|remembered|first|last|another) lanes?\b/g,
  // "lane that way": the direction of a move, with the bar the sentence is about.
  /\blane that way\b/g,
  // A lane that belongs to a swimlane, said as such.
  /\blanes? (?:in|inside|of) (?:a|its|their|the|each|every|that|this|§)? ?(?:swimlane|§)/g,
];

/** The bare `lane` words left in `text`, after the qualified forms are taken out. */
export function bareLaneWords(text: string): string[] {
  let rest = text;
  for (const pattern of QUALIFIED) rest = rest.replace(pattern, ' ');
  return rest.match(/\blanes?\b/gi) ?? [];
}

/** Every user-facing string in a source file; a template has its substitutions replaced by `§`. */
export function copyOf(source: string, fileName = 'x.tsx'): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text + node.templateSpans.map((s) => `§${s.literal.text}`).join(''));
      node.templateSpans.forEach((s) => visit(s.expression));
      return;
    } else if (ts.isJsxText(node)) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out.filter((s) => /\s/.test(s.trim()));
}

describe('swimlane copy never says a bare "lane"', () => {
  it('reads a real roster, every file of which exists', () => {
    const files = rosterFiles();
    expect(files.filter((f) => f.startsWith('features/swimlanes/')).length).toBeGreaterThan(10);
    const all = new Set(allSourceFiles());
    expect(files.filter((f) => !all.has(f))).toEqual([]);
  });

  it('finds the copy it is meant to read', () => {
    const strings = rosterFiles().flatMap((f) => copyOf(readFileSync(join(SRC_DIR, f), 'utf8'), f));
    // Both the C9 position and a swimlane sentence are in the roster, so a parser that read nothing
    // cannot pass.
    expect(strings.some((s) => /lane § of §/.test(s))).toBe(true);
    expect(strings.some((s) => /swimlane/i.test(s))).toBe(true);
  });

  it('no string in the roster says a lane where it means a swimlane', () => {
    const offenders = rosterFiles().flatMap((f) =>
      copyOf(readFileSync(join(SRC_DIR, f), 'utf8'), f)
        .filter((s) => bareLaneWords(s).length > 0)
        .map((s) => `${f}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it('refuses the sentences it exists to refuse', () => {
    for (const bad of [
      'Add a lane',
      'This lane is empty',
      'Delete lane “Civil”?',
      'Rename the lane',
      'Move to lane…',
      'Lanes',
      'Moved to lane 2',
    ]) {
      expect(bareLaneWords(bad), bad).not.toEqual([]);
    }
  });

  it('accepts the forms where "lane" is true of a lane', () => {
    for (const good of [
      'Moved “Pour” to Mechanical, lane 2 of 3.',
      'Moved to §, lane § of §.',
      'Mechanical, swimlane 2 of 5, 14 activities, 3 lanes',
      'Already in the top lane of §.',
      'No free lane that way for “§”; it stays in §.',
      'Activities show under No swimlane, each in its remembered lane.',
      'It takes a lane in its swimlane.',
    ]) {
      expect(bareLaneWords(good), good).toEqual([]);
    }
  });

  it('reads template strings, JSX text and plain literals, and skips comments and imports', () => {
    const source = [
      "import { x } from './swimlane-lanes';",
      '// Add a lane (a comment, not copy)',
      'const a = `Add a lane to ${name}`;',
      "const b = 'key';",
      'const c = <p>Delete this lane</p>;',
      "const d = 'plain sentence here';",
    ].join('\n');
    expect(copyOf(source)).toEqual(['Add a lane to §', 'Delete this lane', 'plain sentence here']);
  });
});
