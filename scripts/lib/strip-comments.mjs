// @ts-check
/**
 * Remove `/* … *\/` and `//` comments from JavaScript or TypeScript source.
 *
 * **A port, not a new implementation.** It is `stripComments` from
 * `apps/api/src/common/contracts/cost-key-scan.ts`, with the same two regular expressions in the
 * same order, because a root `.mjs` gate cannot import a TypeScript module. Keep the two copies
 * identical: they are meant to fail the same way, and a copy that has been "improved" is a second
 * rule wearing the first one's name.
 *
 * **Its blind spot has two forms, and both are recorded behaviour rather than defects to fix.**
 * The expressions do not know what a string literal is, so:
 *
 * 1. a `//` inside a string or template literal is taken as the start of a comment, and everything
 *    after it on that line is removed — `'https://example.test'` loses `//example.test'`;
 * 2. a `/*` inside a string or template literal is taken as the start of a block comment, and
 *    everything up to the next `*\/` is removed — possibly several lines of real code.
 *
 * For `check:engine-parity` limb 2 this means an edit that falls **only** inside the removed span
 * is invisible: changing a URL after its `//`, or text between a `/*` and `*\/` that sit in a
 * string. `scripts/check-engine-parity.test.mjs` pins each form as a known pass-through, so the
 * blind spot cannot grow or shrink without a test saying so.
 */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
