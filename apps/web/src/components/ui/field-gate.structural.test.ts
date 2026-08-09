import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **A permission is a `gate`, never a `disabled`** (ADR-0083 D7).
 *
 * A source-text structural test rather than a compiler check, because the compiler cannot see the
 * difference between a legitimate `disabled={optionsLoading}` and a permission gate: they are the
 * same prop, the same type, on the same component. Only the *expression* distinguishes them.
 *
 * This exists because the rule alone is what the codebase already had — 38 call sites each making
 * the same decision independently — and the API alone is what ADR-0082 and ADR-0064 both record
 * failing: a correct pattern applied to one control and not its neighbour, four times now.
 *
 * Native `disabled` keeps exactly two jobs on a field (ADR-0083 D2): the options have not loaded,
 * and a field above this one has not been answered. Both hold no value, both resolve by the
 * reader's own next action, and neither flips under a reader who is not the one causing it.
 * Everything else — permission, pen, in-flight save, domain rule — is a `gate`, because a field's
 * loss on being disabled is *readability*, and `disabled` removes the value from the tab order,
 * from copy, and (until this ADR) from the contrast floor.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The components whose `disabled` this rule governs.
 *
 * Buttons are deliberately absent — that is ADR-0082's rule, and a button's only loss on being
 * disabled is operability.
 *
 * **A raw `<Select>` is deliberately absent too**, and this is ADR-0083 D1's named exception rather
 * than an oversight: there is no read-only `<select>` and no complete guard for one, so native
 * `disabled` is the ONLY mechanism available to it whatever the reason. A rule about *which
 * mechanism to choose* has nothing to say where there is one. `SelectField` stays governed, because
 * it does have a choice — it takes a `gate`, renders the lock and the reason, and then applies the
 * native attribute itself.
 */
const GOVERNED = [
  'TextField',
  'SelectField',
  'CheckboxField',
  'TextareaField',
  'NumberField',
  'DateField',
  'Input',
  'Textarea',
  'Combobox',
] as const;

/**
 * Words that make an expression a permission rather than one of D2's two states.
 *
 * `isPending` is here because an in-flight save is a gate: the value is still readable and still
 * worth copying while the request is out, and the reader did not ask for it to vanish.
 */
const GATE_WORDS = /\b(writable|canWrite|canEdit|holdsPen|gate|gating|isPending|readOnly)\b/;

/** Every `.tsx` under `src/`, tests excluded — the same walker shape as `surface-seams`. */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Every `disabled=` inside one governed element's attribute list.
 *
 * Brace-aware, and that is not a detail: the ADR records that the first pass at counting this
 * bounded on `[^>]*`, which stops at the first `>` and therefore silently dropped every call site
 * whose props contain an arrow function — i.e. exactly the interesting ones.
 */
function gatedDisabledProps(source: string): Array<{ component: string; expression: string }> {
  const found: Array<{ component: string; expression: string }> = [];
  const opening = new RegExp(`<(${GOVERNED.join('|')})\\b`, 'g');

  for (const match of source.matchAll(opening)) {
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    const attributes = source.slice(start, end);

    // `disabled={…}` with its own brace matching, so a nested object or arrow body is captured whole.
    for (const prop of attributes.matchAll(/\bdisabled=\{/g)) {
      let braces = 1;
      let cursor = prop.index + prop[0].length;
      const from = cursor;
      for (; cursor < attributes.length && braces > 0; cursor += 1) {
        if (attributes[cursor] === '{') braces += 1;
        else if (attributes[cursor] === '}') braces -= 1;
      }
      found.push({
        component: match[1] as string,
        expression: attributes.slice(from, cursor - 1).trim(),
      });
    }
  }
  return found;
}

describe('a permission gate is never a native `disabled`', () => {
  const files = sourceFiles();

  it('scans a non-trivial number of files, so a broken walker cannot pass silently', () => {
    // A floor, not a count: the assertion that matters is the one below, and it says nothing at
    // all if the walker returns an empty list. 200 at the time of writing.
    expect(files.length).toBeGreaterThan(150);
  });

  it('finds no governed control disabled by a permission expression', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { component, expression } of gatedDisabledProps(source)) {
        if (GATE_WORDS.test(expression)) {
          offenders.push(`${relative(SRC, file)} — <${component} disabled={${expression}}>`);
        }
      }
    }
    // Named individually: "there are 31 offenders" is useless during a migration; the list IS the
    // checklist, which is why the ADR asks for this test to be verified red before the migration
    // rather than written green after it.
    expect(offenders, `Use \`gate\` instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
