import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 *   - **"on track" / "behind" / "delayed" / "at risk" / "slipping"** — added with R2 (M3), which is
 *     where they become tempting: a section literally headed "Where the work stands" invites a
 *     verdict, and every one of these words is one. The product knows only how far a finish has
 *     moved against a baseline **somebody in this organisation captured**; whether that constitutes
 *     being behind depends on a contract, a target and a float allowance the schema does not hold.
 *     "14 working days later than Contract award" is the whole of what is known, and it is enough.
 *
 * **`\b` word boundaries, not substring matching**, which is what lets "later" and "earlier" — the
 * two words R2's direction copy is built on — coexist with a ban on "late". That is deliberate and
 * load-bearing: the direction must be carried by a WORD rather than a colour (WCAG 1.4.1), so a
 * substring ban would have forced the copy back onto a sign or an arrow to satisfy a gate.
 *
 * **Comments are stripped before scanning, and the docblock above is why.** Four gates in this
 * repository have gone red or green on their own prose — most sharply ADR-0106 M4, where a docblock
 * explaining why a token must not be used counted as using it. Every banned phrase appears in this
 * file, deliberately, and the gate must not see them.
 */
describe('the overview copy contract', () => {
  const BANNED = [
    'up to date',
    'on time',
    'on schedule',
    'healthy',
    'late',
    // R2's additions — see the docblock. Each is a verdict the data cannot support.
    'on track',
    'behind',
    'delayed',
    'at risk',
    'slipping',
    'overdue',
  ];

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
    // R2's copy lives in a pure model file, which is a different directory from the components the
    // original positive case pinned — so a glob that stopped descending into `model/` would leave
    // every sentence on this screen unscanned while this suite stayed green.
    expect(files.some((f) => f.includes('standing-copy'))).toBe(true);
  });

  it.each(BANNED)('never says "%s"', (phrase) => {
    const offenders = files.filter((file) =>
      new RegExp(`\\b${phrase}\\b`, 'i').test(visibleText(file)),
    );

    expect(offenders, `"${phrase}" claims more than the data supports`).toEqual([]);
  });
});
