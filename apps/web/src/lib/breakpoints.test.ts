import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DESIGNED_MIN_WIDTH_PX, DESIGNED_MIN_WIDTH_QUERY, designedMinWidthPx } from './breakpoints';

describe('DESIGNED_MIN_WIDTH_QUERY', () => {
  it('is Tailwind’s lg, so the notice, the shell and the utility classes share one floor', () => {
    // Read from the installed Tailwind theme rather than restated: if Tailwind (or this app's
    // theme) ever moves `lg`, this fails instead of the shell and the utilities disagreeing.
    const themePath = createRequire(import.meta.url).resolve('tailwindcss/theme.css');
    const lg = /--breakpoint-lg:\s*([\d.]+rem)/.exec(readFileSync(themePath, 'utf8'))?.[1];
    expect(lg).toBe('64rem');
    expect(DESIGNED_MIN_WIDTH_QUERY).toBe(`(min-width: ${lg})`);
  });

  it('is not overridden by the app’s own stylesheet', () => {
    // The theme file above is Tailwind's; `globals.css` is where this app could move `lg` without
    // that test noticing.
    const globals = readFileSync(resolve(import.meta.dirname, '../styles/globals.css'), 'utf8');
    expect(globals).not.toMatch(/--breakpoint-lg\s*:/);
  });

  it('states the same floor in pixels at the default font size, for copy', () => {
    expect(DESIGNED_MIN_WIDTH_PX).toBe(64 * 16);
  });
});

describe('designedMinWidthPx', () => {
  afterEach(() => {
    document.documentElement.style.fontSize = '';
  });

  it('is 1024 at the default font size', () => {
    expect(designedMinWidthPx()).toBe(DESIGNED_MIN_WIDTH_PX);
  });

  it('follows a raised root font size, so the copy and the query name the same width', () => {
    document.documentElement.style.fontSize = '20px';
    expect(designedMinWidthPx()).toBe(1280);
    document.documentElement.style.fontSize = '18.4px';
    expect(designedMinWidthPx()).toBe(1178);
  });
});
