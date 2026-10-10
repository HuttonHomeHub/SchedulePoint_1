import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DESIGNED_MIN_WIDTH_PX,
  DESIGNED_MIN_WIDTH_QUERY,
  designedMinWidthPx,
  PROMOTE_119_5,
  PROMOTE_160,
  PROMOTE_80,
  PROMOTE_90,
  PROMOTION_STAGE_REMS,
  promotionStageQuery,
  SQUAT_MAX_HEIGHT_REM,
  SQUAT_QUERY,
} from './breakpoints';

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

describe('SQUAT_QUERY', () => {
  const globals = readFileSync(resolve(import.meta.dirname, '../styles/globals.css'), 'utf8');

  it('is declared as the stylesheet’s `squat` variant, word for word', () => {
    expect(globals).toContain(`@custom-variant squat (@media ${SQUAT_QUERY});`);
  });

  it('is narrow by exactly the floor’s width and short by its own constant', () => {
    expect(SQUAT_QUERY).toBe(
      `${DESIGNED_MIN_WIDTH_QUERY.replace('min-width: 64rem', 'width < 64rem')} and (height <= ${String(SQUAT_MAX_HEIGHT_REM)}rem)`,
    );
  });

  it('sits under the default narrow-shell window (640 x 480 is 30 rem) and over a 200 % text window (25 rem)', () => {
    expect(SQUAT_MAX_HEIGHT_REM).toBeLessThan(30);
    expect(SQUAT_MAX_HEIGHT_REM).toBeGreaterThanOrEqual(25);
  });
});

describe('the promotion stages', () => {
  it('are the four widths the product is judged at, in rem', () => {
    // 1280, 1440, 1912 and 2560 px at the default 16 px font size.
    expect([PROMOTE_80, PROMOTE_90, PROMOTE_119_5, PROMOTE_160].map((rem) => rem * 16)).toEqual([
      1280, 1440, 1912, 2560,
    ]);
    expect(PROMOTION_STAGE_REMS).toEqual([80, 90, 119.5, 160]);
  });

  it('ascend, so a stage index counts the thresholds the viewport has reached', () => {
    const sorted = [...PROMOTION_STAGE_REMS].sort((a, b) => a - b);
    expect([...PROMOTION_STAGE_REMS]).toEqual(sorted);
  });

  it('start at the first width that is not compact: --container-roomy (79rem) is below it', () => {
    const globals = readFileSync(resolve(import.meta.dirname, '../styles/globals.css'), 'utf8');
    const roomy = /--container-roomy:\s*([\d.]+)rem/.exec(globals)?.[1];
    expect(roomy).toBe('79');
    expect(PROMOTE_80).toBeGreaterThan(Number(roomy));
  });

  it('are spelled as min-width rem queries', () => {
    expect(promotionStageQuery(PROMOTE_119_5)).toBe('(min-width: 119.5rem)');
  });
});
