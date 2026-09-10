import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `Alert` never takes `role` as a prop (ADR-0132, `docs/TECH_DEBT.md` #118 item 3).
 *
 * ADR-0132 added `purpose`, which decides **whether** the alert is a live region. It deliberately
 * did NOT open `role` itself, because `tone` still owns how urgent an event is and letting two call
 * sites answer that differently is how a message model drifts — the argument `alert.tsx`'s docblock
 * has carried since ADR-0077 §9.
 *
 * The risk this gate exists for is specific and it is a plausible tidy-up rather than a mistake:
 * once a component takes a `purpose` prop that decides ARIA, a `role` prop stops looking dangerous,
 * and `Omit<…, 'role'>` reads like a leftover restriction somebody forgot to remove. It is not. Its
 * removal would compile, pass every existing test, and only be visible to a reader who happened to
 * open the props type.
 *
 * **Comments are stripped before scanning.** The docblock this gate protects contains the word
 * `role` many times over, and this repository has now shipped five gates that matched their own
 * prose — including one whose docblock explained why it must not.
 *
 * **The pinned positive is not decoration.** Every other assertion here is about an absence, and an
 * absence is also what a file that stopped existing produces; without it, a green run cannot
 * distinguish "the restriction holds" from "there is nothing to check" (ADR-0093).
 *
 * Verified red 2026-09-09 by deleting the `Omit<…, 'role'>` wrapper: the first assertion failed and
 * the pinned positive kept passing, which is the pair that makes the result mean something.
 */
const ALERT = join(__dirname, 'alert.tsx');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('Alert’s role stays derived', () => {
  const source = stripComments(readFileSync(ALERT, 'utf8'));

  it('is pinned to a real props type — the positive case', () => {
    expect(source).toMatch(/export interface AlertProps/);
    expect(source).toMatch(/purpose:\s*AlertPurpose/);
  });

  it('omits `role` from the props it accepts', () => {
    expect(source).toMatch(/Omit<\s*React\.HTMLAttributes<HTMLDivElement>\s*,\s*'role'\s*>/);
  });

  it('declares no `role` prop of its own', () => {
    // Anchored on a property declaration, not on the bare word: `role` appears legitimately as a
    // local binding destructured from `TONE_META`, which is the derivation this gate protects
    // rather than the thing it forbids. `readonly` is tolerated and the space after the colon is
    // NOT required — Prettier enforces one and no prop here is `readonly`, so both were theoretical
    // gaps rather than live ones, and closing a theoretical gap in a gate costs one character.
    expect(source).not.toMatch(/^\s*(?:readonly\s+)?role\??:/m);
  });
});
