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
 * fact about a parser-blocking `<script src>` in `<head>`, and jsdom has no paint. The plan calls
 * for a visual check in a real browser, and the M1 report-only window is when it happens.
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

  it('applies the dark class for a stored dark preference', () => {
    localStorage.setItem('schedulepoint-theme', 'dark');
    runBoot();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('corporate')).toBe(false);
  });

  it('applies corporate, and corporate wins over the system preference', () => {
    // The precedence that is easy to lose in a move: `corporate` is not a shade, so a dark system
    // setting must not also add `dark` on top of it.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    localStorage.setItem('schedulepoint-theme', 'corporate');
    runBoot();

    expect(document.documentElement.classList.contains('corporate')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('follows the system preference when the stored value is `system`', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    localStorage.setItem('schedulepoint-theme', 'system');
    runBoot();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows the system preference when nothing is stored at all', () => {
    // First visit. The `!stored` branch is the one a careless rewrite drops, and its absence looks
    // like nothing until a dark-mode user opens the app for the first time.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    runBoot();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to light rather than throwing when localStorage is unavailable', () => {
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
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
