// @ts-check
/**
 * Find the feature-flag pins in a Playwright config's text — **in code, not in comments**
 * (`docs/TECH_DEBT.md` #354, the fifth instance of "a code scan reads prose").
 *
 * `check-flags.mjs` assertion 4 used to run the pin expression over the whole file, so a docblock
 * that wrote a pin out as an example (`VITE_X: 'false'`) blocked that flag's retirement as if it
 * were a pin. The direction was mild — it blocked, it never admitted — but it happened.
 *
 * The comments are removed with the shared `stripComments` unchanged (the repository's one
 * stripper, not a fifth private copy). That stripper is string-blind in two documented ways, and
 * one of them could newly HIDE a real pin, which is the dangerous direction for a gate. So the
 * two shapes where the blindness could matter are refused by declaration (ADR-0124) rather than
 * read through it:
 *
 *  - a `/*` inside a string literal would swallow everything up to the next `*\/`, possibly a real
 *    pin on a later line;
 *  - a `//` inside a string followed by a pin on the same line would swallow that pin.
 *
 * A `//` string with the pin on an earlier or later line is safe and is read normally. Neither
 * refused shape occurs in any config today. The quote test is deliberately crude (a quote earlier
 * on the line); a false refusal costs a reworded line, a false pass costs a hidden pin.
 *
 * Returned pins carry no line number: the stripper deletes block comments, so a line counted in
 * the stripped text would not match the file.
 */
import { stripComments } from './strip-comments.mjs';

const PIN = /(VITE_[A-Z0-9_]+)\s*:\s*'(true|false)'/g;

/**
 * @param {string} text
 * @returns {{ pins: { flag: string, value: 'true' | 'false' }[], refusals: string[] }}
 */
export function findPins(text) {
  /** @type {string[]} */
  const refusals = [];
  text.split('\n').forEach((line, i) => {
    const n = i + 1;
    if (/['"`][^'"`\n]*\/\*/.test(line)) {
      refusals.push(
        `line ${n}: a "/*" inside a string literal — cannot read this safely, the comment stripper would swallow code up to the next "*/"`,
      );
    }
    if (/['"`][^'"`\n]*\/\/[^\n]*VITE_[A-Z0-9_]+\s*:\s*'(?:true|false)'/.test(line)) {
      refusals.push(
        `line ${n}: a pin after a "//" inside a string literal — cannot read this safely, the comment stripper would swallow the pin; put the pin on its own line`,
      );
    }
  });
  if (refusals.length > 0) return { pins: [], refusals };
  const pins = [...stripComments(text).matchAll(PIN)].map((m) => ({
    flag: /** @type {string} */ (m[1]),
    value: /** @type {'true' | 'false'} */ (m[2]),
  }));
  return { pins, refusals };
}
