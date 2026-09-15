import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **An empty state is copy in the frame the table already draws — never a second framed thing.**
 *
 * `DataTable` wraps any non-blank `empty` node in `EMPTY_FRAME` (`data-table.tsx`), which is a
 * dashed, centred, muted box. An alert brings a border, a tint, a leading icon and its own padding.
 * Nesting them renders ONE message inside TWO boxes, with the frame's `text-center` fighting the
 * alert's left-aligned icon row — and it had happened three times: the console's policy panel and
 * both of the performance panel's tables.
 *
 * Nothing could see it. Every unit suite runs in jsdom, which has no layout, so an assertion that
 * the sentence is present passes identically against one box and two; the empty-state consolidation
 * gate next door asks whether a site hand-rolls the dashed treatment, which this does not — it asks
 * the primitive for it, twice over. It took a photograph.
 *
 * **The rule is about the treatment, not about the words.** Where an empty table genuinely needs a
 * caveat with a tone — "an empty table is not proof the policy is clean" — the caveat belongs BESIDE
 * the table and wired to it with `describedById`, because such a caveat qualifies the rows in every
 * state and not only in the absent one. Putting it in `empty` also means the reader who most needs
 * it, the one looking at three rows, never sees it.
 *
 * **Verified red** against the three sites as they shipped.
 */
const ROOT = 'src';

/** The framed things. `EMPTY_FRAME` catches a caller reaching for the constant directly. */
const FRAMED = [
  { name: 'an `Alert`', pattern: /<Alert[\s/>]/ },
  { name: 'a `NoticeStrip`', pattern: /<NoticeStrip[\s/>]/ },
  { name: 'the dashed frame itself', pattern: /EMPTY_FRAME/ },
];

/**
 * Every `empty=` prop expression in a file, with balanced braces.
 *
 * A scanner rather than a regex because these expressions run to several lines, and `[\s\S]*?` to a
 * closing brace would stop at the first `}` inside a nested JSX expression and read less than it
 * claims — the under-inclusion failure ADR-0131 records finding in its own gate.
 */
function emptyProps(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/\bempty=/g)) {
    let i = (match.index ?? 0) + match[0].length;
    if (source[i] === '"' || source[i] === "'") continue; // a plain string can hold no element
    if (source[i] !== '{') continue;
    let depth = 0;
    const start = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(start, i + 1));
  }
  return out;
}

describe('an empty state is not framed twice', () => {
  const files = execFileSync('git', ['ls-files', ROOT], { cwd: process.cwd(), encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path));

  const scanned = files.map((path) => ({
    path,
    props: emptyProps(
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    ),
  }));

  /**
   * The pinned positive case. "No `empty` prop holds an `Alert`" passes perfectly over a scan that
   * found no files, and equally well over one where every table has been deleted — the shape
   * ADR-0093 records, where a green suite cannot tell "the defect is gone" from "the subject is".
   */
  it('reads the tree, and finds the empty props that exist', () => {
    expect(scanned.length).toBeGreaterThan(200);
    const withProps = scanned.filter((file) => file.props.length > 0);
    expect(
      withProps.length,
      'the scan found no `empty=` expression anywhere — it has stopped reading',
    ).toBeGreaterThan(0);
  });

  it.each(FRAMED)('never puts $name in an `empty` prop', ({ pattern }) => {
    const offenders = scanned.flatMap((file) =>
      file.props
        .filter((prop) => pattern.test(prop))
        .map((prop) => `${file.path}: ${prop.replace(/\s+/g, ' ').slice(0, 110)}`),
    );

    expect(
      offenders,
      '`DataTable` frames a non-blank `empty` node itself — pass the sentence, and put a caveat ' +
        'that needs a tone beside the table with `describedById`',
    ).toEqual([]);
  });
});
