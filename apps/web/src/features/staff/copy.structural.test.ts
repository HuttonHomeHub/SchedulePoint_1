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
 * - `perf-probe/ui/probe-report.ts` is the paste-ready record of a measurement, for the same reason.
 * - `model/diagnostics-report.ts` owns the diagnostics questions and the pasted record (ADR-0140). Its
 *   text is what a staff member copies into a measurement record, where an ADR number is a reference
 *   rather than jargon, and it is not resting prose on the screen.
 * - `features/perf-probe/ui` is not a named exception any more: the performance box's own files are
 *   scanned below (M4), so the box that used to be the one place resting prose was never checked is
 *   held to the same rule as the rest.
 */
const FEATURE = join(import.meta.dirname);
const FORBIDDEN = /ADR-\d|\bDELETE\b|[A-Z]{3,}_[A-Z_]{3,}/;

const PROBE_UI = join(FEATURE, '..', 'perf-probe', 'ui');

const FILES = [
  ...readdirSync(join(FEATURE, 'ui'))
    .filter((name) => /\.tsx$/.test(name) && !name.includes('.test.'))
    .map((name) => `ui/${name}`),
  // Every `*copy.ts` in `model`, so a new copy module is scanned without somebody remembering to list it.
  ...readdirSync(join(FEATURE, 'model'))
    .filter((name) => /copy\.ts$/.test(name))
    .map((name) => `model/${name}`),
  // The performance box (M4): the files that hold its resting prose. `loading-probe-section.tsx` and
  // the sittings table are the two that print sentences of their own.
  ...readdirSync(PROBE_UI)
    // `probe-report.ts` is the pasted record, the same exception as `diagnostics-report.ts` below.
    .filter(
      (name) => /\.tsx?$/.test(name) && !name.includes('.test.') && name !== 'probe-report.ts',
    )
    .map((name) => `../perf-probe/ui/${name}`),
  'model/console-status.ts',
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
function resting(source: string): string[] {
  const code = withoutHowToFix(strip(source));
  // An interpolation is code, not prose: `${NOT_RECORDED}` names a constant and says nothing a reader
  // sees, and the probe's sentences are full of them.
  const strings = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((match) =>
    (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ''),
  );
  // A `>` that is a comparison (`a > LIMIT_MS && (`) opens no element; text with an operator in it is
  // an expression the regex has mistaken for prose.
  const jsxText = [...code.matchAll(/>([^<>{}=;]+)</g)]
    .map((match) => match[1] ?? '')
    .filter((text) => !/&&|\|\|/.test(text));
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

  it('does not mistake an interpolated constant or a comparison for prose', () => {
    expect(resting('const a = `taken ${NOT_RECORDED} ago`;').some((s) => FORBIDDEN.test(s))).toBe(
      false,
    );
    expect(
      resting('{a > SITTING_SPREAD_LIMIT_MS && (\n<Alert>x</Alert>)}').some((s) =>
        FORBIDDEN.test(s),
      ),
    ).toBe(false);
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
