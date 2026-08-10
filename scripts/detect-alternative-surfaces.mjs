#!/usr/bin/env node
/**
 * **Which feature flags select between two different components?** (ADR-0088 D2, axis 1.)
 *
 * A flag whose two branches render different components is an **alternative surface** — the "second
 * product maintained forever" ADR-0084 describes, and the only shape for which that description is
 * earned. A flag guarding one line is not, however many lines sit behind it: absence cannot drift,
 * and drift between two implementations of one surface is what ADR-0080's shipped defect was.
 *
 * **This detector is a tripwire, not the classifier.** `flag-retirement.json`'s `classA` list is
 * authoritative; this asserts `detected ⊆ curated` and never the converse (ADR-0088 D2). The reason
 * is that it can only under-detect: a flag branching by early `return` in two functions, by
 * `const Body = FLAG ? A : B`, or through an indirection (`GANTT_VIEW` gates a `planView` value that
 * a ternary elsewhere reads) is invisible here and legitimately curated by hand. Asserting the
 * converse would fail those.
 *
 * **Written after two wrong versions, both recorded because the wrongness is the lesson:**
 *   1. "the flag appears in a ternary" — matched **48 of 57 flags**. Useless.
 *   2. "two different capitalised arms in a `.tsx`" — matched two flags, and the WRONG two.
 *   3. "a `return` whose arms are JSX roots" — found the two known cases and **missed
 *      `ACTIVITY_EDITOR_TABS`**, which branches inside JSX (`{FLAG ? (<A/>) : (<B/>)}`) rather than
 *      at a `return`. A reviewer found it by reading, minutes after the ADR claimed the rule was
 *      "verified against this codebase". That is the failure ADR-0058 exists to name, occurring
 *      inside the document naming it.
 *
 * So this one does not pattern-match the surrounding statement at all. It finds `FLAG ?`, then scans
 * forward **balancing brackets** to the `:` that belongs to that ternary, and asks whether both arms
 * begin with a JSX element. Anchoring on syntax around the ternary is what produced versions 1–3.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/web/src');

/** Every `.tsx` under `apps/web/src`, tests excluded — a test's branches are not the product. */
function sources(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') && !path.includes('.test.') ? [path] : [];
  });
}

/**
 * The `:` belonging to the `?` at `start`, or -1.
 *
 * Bracket-balanced rather than regex, because a non-greedy scan stops at the first `:` it sees —
 * which inside a JSX arm is routinely an object literal, a nested ternary or a `style` prop.
 */
function matchingColon(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return -1;
      depth -= 1;
    } else if (c === '?' && source[i + 1] !== '.' && i !== start)
      depth += 1000; // nested ternary
    else if (c === ':' && depth === 0) return i;
    else if (c === ':' && depth >= 1000) depth -= 1000;
  }
  return -1;
}

/** The first JSX element name an arm opens with, or null if the arm is not a JSX root. */
function jsxRoot(arm) {
  const m = /^\s*\(?\s*<\s*([A-Za-z][\w.]*)?/.exec(arm);
  if (!m) return null;
  return m[1] ?? '<>'; // a bare `<>` fragment is a root too — the legacy-dialog trio is one
}

export function detectAlternativeSurfaces() {
  const env = readFileSync(join(SRC, 'config/env.ts'), 'utf8');
  const constants = [...env.matchAll(/export const ([A-Z0-9_]+_ENABLED)/g)].map((m) => m[1]);
  const byConstant = new Map();
  for (const m of env.matchAll(
    /export const ([A-Z0-9_]+_ENABLED)[\s\S]{0,200}?import\.meta\.env\.(VITE_[A-Z0-9_]+)/g,
  )) {
    byConstant.set(m[1], m[2]);
  }

  const found = new Map();
  for (const file of sources(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const constant of constants) {
      const re = new RegExp(`\\b${constant}\\s*\\?`, 'g');
      for (const m of source.matchAll(re)) {
        const q = m.index + m[0].length - 1;
        const colon = matchingColon(source, q + 1);
        if (colon === -1) continue;
        const left = jsxRoot(source.slice(q + 1, colon));
        const right = jsxRoot(source.slice(colon + 1, colon + 200));
        if (left === null || right === null || left === right) continue;
        const flag = byConstant.get(constant) ?? constant;
        if (!found.has(flag)) found.set(flag, []);
        found.get(flag).push({
          file: file.replace(`${SRC}/`, ''),
          line: source.slice(0, q).split('\n').length,
          left,
          right,
        });
      }
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = detectAlternativeSurfaces();
  console.log(`alternative surfaces detected: ${found.size}\n`);
  for (const [flag, sites] of [...found].sort()) {
    console.log(`  ${flag}`);
    for (const s of sites) console.log(`      ${s.file}:${s.line}   <${s.left}> vs <${s.right}>`);
  }
}
