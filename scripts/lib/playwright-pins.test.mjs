// @ts-check
/**
 * Fixtures for `playwright-pins.mjs` (`docs/TECH_DEBT.md` #354), both directions.
 *
 * Verified red against both wrong gates (ADR-0110 D5): the old raw scan (`text.matchAll(PIN)`)
 * fails the "comment is not a pin" cases, and a reader that finds nothing (`() => ''` in place of
 * the stripper's input) fails the "real pin is found" cases.
 *
 * Run standalone: `node scripts/lib/playwright-pins.test.mjs`
 */
import assert from 'node:assert/strict';

import { findPins } from './playwright-pins.mjs';

const cases = [];
/** @param {string} name @param {() => void} fn */
const it = (name, fn) => cases.push([name, fn]);

it("finds a 'false' pin in an env block", () => {
  const { pins, refusals } = findPins(`env: {\n  VITE_A: 'false',\n},`);
  assert.deepEqual(pins, [{ flag: 'VITE_A', value: 'false' }]);
  assert.deepEqual(refusals, []);
});

it("finds a 'true' pin in an env block", () => {
  const { pins } = findPins(`env: { VITE_B: 'true' }`);
  assert.deepEqual(pins, [{ flag: 'VITE_B', value: 'true' }]);
});

it('ignores a pin written out in a docblock', () => {
  const { pins } = findPins(`/**\n * Pins VITE_A: 'false' for the base journey.\n */\nenv: {}`);
  assert.deepEqual(pins, []);
});

it('ignores a pin written out in a line comment', () => {
  assert.deepEqual(findPins(`// VITE_A: 'false'\nenv: {}`).pins, []);
});

it("ignores #354's exhibit wording: a comment quoting the pin form", () => {
  const { pins } = findPins(
    `// the pin form is \`VITE_TSLD_EDITING: 'false'\`\nenv: { VITE_C: 'true' }`,
  );
  assert.deepEqual(pins, [{ flag: 'VITE_C', value: 'true' }]);
});

it('reads a pin on the line after a URL (the safe // case)', () => {
  const { pins, refusals } = findPins(
    `baseURL: 'http://localhost:5173',\nenv: { VITE_A: 'false' },`,
  );
  assert.deepEqual(refusals, []);
  assert.deepEqual(pins, [{ flag: 'VITE_A', value: 'false' }]);
});

it('reads a pin that precedes a URL on the same line', () => {
  const { pins, refusals } = findPins(`env: { VITE_A: 'false' }, url: 'http://x.test',`);
  assert.deepEqual(refusals, []);
  assert.deepEqual(pins, [{ flag: 'VITE_A', value: 'false' }]);
});

it('refuses a "//" string followed by a pin on the same line', () => {
  const { pins, refusals } = findPins(`url: 'http://x.test', env: { VITE_A: 'false' },`);
  assert.equal(refusals.length, 1);
  assert.match(refusals[0] ?? '', /^line 1: .*cannot read this safely/);
  assert.deepEqual(pins, []);
});

it('refuses a "/*" inside a string literal, naming the line', () => {
  const { refusals } = findPins(
    `a: 1,\ntestMatch: 'dir/*.spec.ts',\nenv: { VITE_A: 'false' },\n// */`,
  );
  assert.equal(refusals.length, 1);
  assert.match(refusals[0] ?? '', /^line 2: /);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n${e instanceof Error ? e.message : e}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`playwright-pins: ${cases.length} cases ok`);
