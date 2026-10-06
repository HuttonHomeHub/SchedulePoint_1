import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pointer-check diagnostic page (`docs/specs/gantt-coarse-pointer/` M0-T2): it must render the
 * four media values, the pixel ratio and the viewport, and it must take no input and make no
 * request (ADR-0140).
 *
 * It reads the **real served files**, as `theme-boot.test.ts` does, because the script is not a
 * module and a copy of it in this test would prove only that the copy works. What it cannot prove
 * is what a Surface answers with the cover folded; that is the device checklist's question.
 */
const root = process.cwd();
const html = readFileSync(resolve(root, 'public/pointer-check.html'), 'utf8');
const source = readFileSync(resolve(root, 'public/pointer-check.js'), 'utf8');

type Listener = () => void;

function stubMedia(matching: readonly string[]): { listeners: Listener[] } {
  const listeners: Listener[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matching.includes(query),
      addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
    })),
  );
  return { listeners };
}

function run(): void {
  // `new Function` for the reason `theme-boot.test.ts` gives: the file is a classic script from this
  // repository, and evaluating it is the whole point.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(source)();
}

const text = (id: string): string => document.getElementById(id)?.textContent ?? '';

describe('pointer-check page', () => {
  beforeEach(() => {
    document.body.innerHTML =
      /<body>([\s\S]*)<\/body>/.exec(html)?.[1]?.replace(/<script[\s\S]*?<\/script>/g, '') ?? '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prints pointer, any-pointer, hover, any-hover, pixel ratio and viewport', () => {
    stubMedia([
      '(pointer: coarse)',
      '(any-pointer: fine)',
      '(any-pointer: coarse)',
      '(hover: none)',
      '(any-hover: hover)',
    ]);
    vi.stubGlobal('devicePixelRatio', 1.5);
    run();
    expect(text('pointer')).toBe('coarse');
    expect(text('any-pointer')).toBe('fine + coarse');
    expect(text('hover')).toBe('none');
    expect(text('any-hover')).toBe('hover');
    expect(text('device-pixel-ratio')).toBe('1.5');
    expect(text('viewport')).toMatch(/^\d+ x \d+$/);
  });

  it('updates when a media query changes, which is what folding the cover does', () => {
    const matching = ['(pointer: fine)', '(hover: hover)'];
    const media = stubMedia(matching);
    run();
    expect(text('pointer')).toBe('fine');
    matching.splice(0, matching.length, '(pointer: coarse)', '(hover: none)');
    media.listeners.forEach((fn) => fn());
    expect(text('pointer')).toBe('coarse');
    expect(text('hover')).toBe('none');
  });

  it('takes no input and makes no request', () => {
    expect(html).not.toMatch(/<(input|textarea|select|form|button)\b/i);
    expect(source).not.toMatch(
      /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|document\.cookie/,
    );
  });

  it('loads its script and style as files, because the origin allows no inline code', () => {
    expect(html).toContain('<script src="/pointer-check.js"></script>');
    expect(html).toContain('href="/pointer-check.css"');
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
  });
});
