import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **One clipboard write, so one answer to "what happens when it is refused?"**
 *
 * Five call sites wrote to the clipboard directly and gave four different answers. Three set a
 * `copied` flag back to `false` on rejection — byte-identical to never having pressed the button:
 * no visible change, nothing announced, on a browser that refuses clipboard access, which is an
 * ordinary configuration rather than an edge case (WCAG 4.1.3). A fourth said nothing in either
 * direction. Only `ShareLinksDialog` was complete, and only it guarded `navigator.clipboard` being
 * **undefined** — which matters more than it reads, because in an insecure context
 * `navigator.clipboard.writeText(…)` throws SYNCHRONOUSLY and the `.then(onError)` the other four
 * relied on could never run in the one configuration it was written for.
 *
 * The sharpest part is where the fix already existed: `diagnostics-panel.tsx`'s own comment records
 * the M4 accessibility review finding the silent-rejection defect and fixing it — in that file,
 * while three siblings kept it. One correct pattern applied to a control and not its neighbours,
 * documented in the copy that got it right.
 *
 * So the rule is a gate rather than a convention, and it is the only thing that stops a sixth site
 * arriving with a fifth answer.
 *
 * **Verified red** against the five sites as they shipped.
 */
const ROOT = 'src';

/** The hook itself is the one legitimate writer. */
const HOOK = 'src/hooks/use-clipboard-copy.ts';

describe('the clipboard is written in exactly one place', () => {
  const files = execFileSync('git', ['ls-files', ROOT], { cwd: process.cwd(), encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));

  const scanned = files.map((path) => ({
    path,
    // Comments stripped: this file's neighbours discuss `writeText` in prose, and four gates in
    // this repository have shipped a scan that matched its own docblock.
    source: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }));

  /**
   * The pinned positive case. "Nobody writes to the clipboard" passes perfectly over a scan that
   * found no files AND over a product that has lost the capability altogether — the shape ADR-0093
   * records, where a green suite cannot tell "the duplicate is gone" from "the feature is gone".
   */
  it('reads the tree, and the one writer is still there', () => {
    expect(scanned.length).toBeGreaterThan(200);
    const hook = scanned.find((file) => file.path === HOOK);
    expect(hook, `${HOOK} is missing — the shared clipboard writer has gone`).toBeDefined();
    expect(hook?.source).toContain('writeText');
  });

  it('is never written directly by a feature', () => {
    const offenders = scanned
      .filter(
        (file) =>
          file.path !== HOOK && /clipboard\s*[?.]?\s*\.?\s*writeText|writeText\(/.test(file.source),
      )
      .map((file) => file.path);

    expect(
      offenders,
      'use `useClipboardCopy` — it carries the absent-API guard and announces BOTH outcomes, ' +
        'which is the half every hand-rolled copy button in this repository has got wrong',
    ).toEqual([]);
  });
});
