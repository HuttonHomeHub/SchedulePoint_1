import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Resting prose on the staff console names no ADR, SQL verb or environment variable** (staff
 * console redesign M3, SC-9, ADR-0178 D-7). The technical step lives in a "How to fix" body, where a
 * reader chooses to open it, and nowhere else: the console's reader is the person who runs the
 * installation and is often not a developer, and `MAIL_ALERT_URL` in a sentence is a word they
 * cannot act on.
 *
 * It scans string literals and JSX text in the console's own files (`features/staff/ui`, and the
 * `model` modules that hold its copy), after stripping comments (four earlier gates matched their own
 * prose; `archetypes.structural.test.ts` carries the precedent) and after removing every
 * `howToFix={…}` expression, which is the one place the rule allows them.
 *
 * **Named exceptions, each with its reason:**
 *
 * - `model/diagnostics-report.ts` owns the diagnostics questions and the pasted record (ADR-0140). Its
 *   text is what a staff member copies into a measurement record, where an ADR number is a reference
 *   rather than jargon, and it is not resting prose on the screen.
 * - `features/perf-probe/ui` is the performance box, split and re-worded in M4; it is not scanned here.
 */
const FEATURE = join(import.meta.dirname);
const FORBIDDEN = /ADR-\d|\bDELETE\b|[A-Z]{3,}_[A-Z_]{3,}/;

const FILES = [
  ...readdirSync(join(FEATURE, 'ui'))
    .filter((name) => /\.tsx$/.test(name) && !name.includes('.test.'))
    .map((name) => `ui/${name}`),
  'model/panel-copy.ts',
  'model/enum-copy.ts',
  'model/console-status.ts',
  'model/retention-copy.ts',
];

/** Remove `howToFix={ … }` by brace depth, since the body is arbitrary JSX. */
function withoutHowToFix(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const at = code.indexOf('howToFix={', i);
    if (at === -1) return out + code.slice(i);
    out += code.slice(i, at);
    let depth = 0;
    let j = at + 'howToFix='.length;
    for (; j < code.length; j += 1) {
      if (code[j] === '{') depth += 1;
      else if (code[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The prose a reader could see: quoted strings and the text between JSX tags. */
export function resting(source: string): string[] {
  const code = withoutHowToFix(strip(source));
  const strings = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
  const jsxText = [...code.matchAll(/>([^<>{}=;]+)</g)].map((match) => match[1] ?? '');
  return [...strings, ...jsxText];
}

describe('resting prose on the staff console (SC-9)', () => {
  // The pinned positive case: a scan that found nothing passes every assertion below.
  it('reads the console files', () => {
    expect(FILES.length).toBeGreaterThan(12);
    const text = FILES.map((file) => readFileSync(join(FEATURE, file), 'utf8')).join('\n');
    expect(text).toContain('MAIL');
  });

  // Each form the rule exists for, planted: red against a scan that reads only one of them.
  it('finds an environment variable, an ADR number and a SQL verb in a string or in JSX text', () => {
    expect(
      resting('const a = "Set MAIL_SMTP_URL to fix this";').some((s) => FORBIDDEN.test(s)),
    ).toBe(true);
    expect(resting('const a = "see ADR-0085";').some((s) => FORBIDDEN.test(s))).toBe(true);
    expect(resting('const a = "it refuses DELETE";').some((s) => FORBIDDEN.test(s))).toBe(true);
    expect(
      resting('<p>Set <code>HEARTBEAT_URL</code> now</p>').some((s) => FORBIDDEN.test(s)),
    ).toBe(true);
  });

  it('allows them inside a howToFix body, and nowhere else in the same element', () => {
    const inside =
      '<ConditionStrip howToFix={<p>Set <code>MAIL_SMTP_URL</code></p>}>Not set up</ConditionStrip>';
    expect(resting(inside).some((s) => FORBIDDEN.test(s))).toBe(false);
    expect(resting(`${inside}<p>MAIL_SMTP_URL</p>`).some((s) => FORBIDDEN.test(s))).toBe(true);
  });

  it.each(FILES)('%s names no ADR, SQL verb or environment variable outside How to fix', (file) => {
    const offenders = resting(readFileSync(join(FEATURE, file), 'utf8')).filter((text) =>
      FORBIDDEN.test(text),
    );
    expect(offenders).toEqual([]);
  });
});
