/**
 * **The cost-shaped-key scanner, shared by every role-invariance gate.**
 *
 * A response that carries no cost, rate or budget field at any depth cannot vary by role, so one
 * URL produces one document — which is what makes a report a handover artefact. Two routes now rest
 * on that: the DCMA health report (ADR-0116 G4) and the cross-plan revision comparison.
 *
 * **It is extracted rather than copied**, and this repository's own record is the argument: the
 * health gate's first version was line-anchored, and the M5 security review found a Prettier-clean
 * single-line literal and a shorthand property both sailing past a docblock claiming to catch
 * exactly them. A second copy of this scanner would be a second place for a bypass to survive after
 * it was fixed here — and the drift would be invisible, because each gate goes green on its own
 * sources either way (the ADR-0065 `routeOrthogonal` argument). The health gate's suite passing
 * **unchanged** through the extraction is what proves it is the same scanner.
 *
 * **Blind spots, restated rather than inherited silently.** A nested type imported from a file the
 * caller does not scan is invisible to a source scan; so is a value smuggled through a variable
 * whose own name is innocent. This pins the local temptation — the well-meant later edit adding a
 * total "for completeness" — and never claims to prove the response shape end to end.
 */

/** The names a role-varying field would carry. */
export const COST_SHAPED = /cost|budget|rate|expense/i;

/**
 * Comments carry prose, and prose about a defect quotes the defect.
 *
 * Four gates in this repository have gone red or green on their own docblocks; that is the most
 * recorded instrument failure here, so stripping is not an optimisation.
 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Keys declared at line start — class properties, multi-line object literals. */
const DECLARATION_KEY = /^\s+(?:public\s+|private\s+|readonly\s+)*([A-Za-z_$][\w$]*)[!?]?\s*:/gm;
/** Keys after `{` or `,` ANYWHERE — single-line object literals, the first recorded bypass. */
const INLINE_KEY = /[{,]\s*([A-Za-z_$][\w$]*)[!?]?\s*:/g;
/**
 * A key preceded by a DECORATOR on the same line — `@ApiProperty() budgetVariance!: number;`.
 *
 * **The third recorded bypass, and it was found by giving this scanner a second consumer rather
 * than by anything failing.** Neither pattern above can see it: the key is not at line start, and
 * it follows a `)` rather than a `{` or a `,`. The health report's own gate was green against this
 * form only because `plan-health-check.dto.ts` happens not to use it — correct by luck of
 * formatting, not by construction — while `revision-compare.dto.ts` uses it twenty times and the
 * cross-plan DTO throughout. A one-line Prettier reflow of a two-line property would have made a
 * cost field invisible to the gate written to catch it, with nothing going red.
 */
const DECORATED_KEY = /\)\s+(?:public\s+|private\s+|readonly\s+)*([A-Za-z_$][\w$]*)[!?]?\s*:/g;

/**
 * Banned-named SHORTHAND properties (`{ narrowing, budgetImpact }`) — the second recorded bypass.
 * No `:` exists, so a key pattern structurally cannot see them. Restricted to banned names so this
 * does not flag every destructuring in a file.
 */
const SHORTHAND = /[{,]\s*((?:cost|budget|rate|expense)[\w$]*)\s*[,}]/gi;

/** Every cost-shaped key the text declares, in any of the three forms. */
export function scanForCostKeys(text: string): string[] {
  const found: string[] = [];
  for (const pattern of [DECLARATION_KEY, INLINE_KEY, DECORATED_KEY]) {
    for (const match of text.matchAll(pattern)) {
      const key = match[1];
      if (key !== undefined && COST_SHAPED.test(key)) found.push(key);
    }
  }
  for (const match of text.matchAll(SHORTHAND)) {
    const key = match[1];
    if (key !== undefined) found.push(key);
  }
  return found;
}

/**
 * Every key the text declares, banned or not — the **non-vacuity control**.
 *
 * "No banned key was found" passes perfectly against a scan that read nothing, which is this
 * repository's most-recorded green-for-the-wrong-reason failure. A caller asserts this is non-zero
 * before believing the other assertion.
 */
export function allKeys(text: string): string[] {
  const keys: string[] = [];
  for (const pattern of [DECLARATION_KEY, INLINE_KEY, DECORATED_KEY]) {
    for (const match of text.matchAll(pattern)) {
      if (match[1] !== undefined) keys.push(match[1]);
    }
  }
  return keys;
}
