import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pre-paint theme boot, pinned after it moved out of `index.html` (ADR-0074 M1-T1).
 *
 * **Why this test exists.** The move was made for a security reason — an inline script forces
 * `script-src` to carry `'unsafe-inline'` or a hash — and it is exactly the kind of change that
 * looks free and is not. If the logic drifted while moving, the symptom is a flash of the wrong
 * theme on first paint, which no other test in the repository would notice and which a reviewer
 * reading a diff of "same lines, new file" would not either.
 *
 * It reads the **real served file** rather than a copy, so a future edit to `public/theme-boot.js`
 * is covered by definition. Reading it and evaluating it is the only way: the file is not a module
 * and is deliberately not imported by the bundle.
 *
 * What it cannot prove is that the script still runs **before first paint** — that is a browser
 * fact about a parser-blocking `<script src>` in `<head>`, and jsdom has no paint.
 *
 * **Since ADR-0097 every case below asserts an absence, and that is the guarantee rather than a
 * weakening of it.** There is one theme and `:root` is its block, so the script stamps nothing
 * whatever it reads — which means this file and `hooks/use-theme.tsx` cannot disagree about what
 * to paint, and a flash of the wrong theme is unrepresentable rather than avoided. The cases are
 * kept parametrised over every value the old arrangement could store because "no class, ever"
 * is the whole contract: a suite asserting the happy path alone would pass equally against a
 * script that stamped a class for one stored value out of six.
 */
// Resolved from the vitest root (`apps/web`) rather than `import.meta.url`, which jsdom serves
// as an `http://localhost/` URL that `fileURLToPath` refuses.
const source = readFileSync(resolve(process.cwd(), 'public/theme-boot.js'), 'utf8');

function runBoot(): void {
  // `new Function` rather than `eval` so the script gets its own scope, as a `<script src>` would.
  // The rule guards against evaluating untrusted input; the input here is a file in this repo,
  // read from disk, and evaluating it is the entire point — a copy of the source in this test
  // would prove only that the copy works.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(source)();
}

describe('theme-boot.js', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['dark', 'the preference a reader actually chose before the collapse'],
    ['light', 'the same, one value along'],
    ['system', 'the old default, which most readers never wrote explicitly'],
    ['corporate', 'the value that survives — and still stamps nothing'],
    ['nonsense', 'a value no version of this product ever wrote'],
    ['', 'an empty string, which is neither absent nor valid'],
  ])('stamps no class for a stored %s (%s)', (stored) => {
    localStorage.setItem('schedulepoint-theme', stored);
    runBoot();

    expect(document.documentElement.className).toBe('');
  });

  it('stamps no class when nothing is stored at all', () => {
    // First visit, and the case a careless rewrite is most likely to get wrong — under the old
    // arrangement this was the `!stored` branch whose absence looked like nothing until a
    // dark-mode user opened the app for the first time. It is now the same answer as every
    // other input, which is the point.
    runBoot();

    expect(document.documentElement.className).toBe('');
  });

  it('stamps no class whatever the system preference says', () => {
    // `prefers-color-scheme` no longer selects anything. Kept as a case rather than dropped
    // because a dark theme returning is where a media-query branch would come back, and this
    // is the assertion that would have to change with it.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    localStorage.setItem('schedulepoint-theme', 'system');
    runBoot();

    expect(document.documentElement.className).toBe('');
  });

  it('does not throw when localStorage is unavailable', () => {
    // Private-browsing modes and some embedded webviews throw on access. An exception here would
    // run before React mounts, so it would take the whole app down rather than the theme.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('access denied');
      },
    });

    expect(() => {
      runBoot();
    }).not.toThrow();
    expect(document.documentElement.className).toBe('');
  });
});
