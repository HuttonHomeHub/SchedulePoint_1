import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The overview may not claim more than its data supports.
 *
 * **Every defect this epic repairs is a sentence that outran its data**, so the spec's copy
 * contract (§"Copy contract") is a gate rather than a paragraph. The banned phrases are banned for
 * specific, different reasons:
 *
 *   - **"up to date"** — the freshness check knows only that nothing has been WRITTEN since the
 *     calculation. It cannot know the dates are right, and a plan whose calendar changed under it
 *     is stale in every sense that matters while this check says nothing at all (§0.4).
 *   - **"on time" / "on schedule" / "late"** — there is no target column anywhere in the schema
 *     (§0.5). A plan finishes when it finishes; whether that is late is a fact about a contract the
 *     product does not hold.
 *   - **"healthy"** — ADR-0116's vocabulary, about how a plan is BUILT. Borrowing it here would
 *     give one word two meanings across two screens.
 *
 * **Comments are stripped before scanning, and the docblock above is why.** Four gates in this
 * repository have gone red or green on their own prose — most sharply ADR-0106 M4, where a docblock
 * explaining why a token must not be used counted as using it. Every banned phrase appears in this
 * file, deliberately, and the gate must not see them.
 */
describe('the overview copy contract', () => {
  const BANNED = ['up to date', 'on time', 'on schedule', 'healthy', 'late'];

  const files = globSync('src/features/overview/**/*.{ts,tsx}', { cwd: process.cwd() }).filter(
    // This file names every banned phrase to explain it. The gate's subject is the FEATURE's copy.
    (file) => !file.endsWith('freshness-copy.structural.test.ts'),
  );

  /** Source with block comments, line comments and import lines removed. */
  const visibleText = (file: string): string =>
    readFileSync(join(process.cwd(), file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/^import[\s\S]*?from\s+'[^']*';$/gm, '');

  it('scans a non-empty set of files', () => {
    // The pinned positive case. "No file contains a banned phrase" passes perfectly against a glob
    // that matched nothing — a green suite that cannot tell "the copy is clean" from "there is no
    // copy" (ADR-0093, and ADR-0108's census gate, which shipped with exactly this hole).
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.includes('RecentlyChangedRow'))).toBe(true);
  });

  it.each(BANNED)('never says "%s"', (phrase) => {
    const offenders = files.filter((file) =>
      new RegExp(`\\b${phrase}\\b`, 'i').test(visibleText(file)),
    );

    expect(offenders, `"${phrase}" claims more than the data supports`).toEqual([]);
  });
});
