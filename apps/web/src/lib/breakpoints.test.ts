import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { DESIGNED_MIN_WIDTH_PX, DESIGNED_MIN_WIDTH_QUERY } from './breakpoints';

describe('DESIGNED_MIN_WIDTH_QUERY', () => {
  it('is Tailwind’s lg, so the notice, the shell and the utility classes share one floor', () => {
    // Read from the installed Tailwind theme rather than restated: if Tailwind (or this app's
    // theme) ever moves `lg`, this fails instead of the shell and the utilities disagreeing.
    const themePath = createRequire(import.meta.url).resolve('tailwindcss/theme.css');
    const lg = /--breakpoint-lg:\s*([\d.]+rem)/.exec(readFileSync(themePath, 'utf8'))?.[1];
    expect(lg).toBe('64rem');
    expect(DESIGNED_MIN_WIDTH_QUERY).toBe(`(min-width: ${lg})`);
  });

  it('states the same floor in pixels at the default font size, for copy', () => {
    expect(DESIGNED_MIN_WIDTH_PX).toBe(64 * 16);
  });
});
