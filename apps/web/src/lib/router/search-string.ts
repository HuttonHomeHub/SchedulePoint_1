/**
 * **One spelling of one rule: how a search param becomes a string** (`docs/TECH_DEBT.md` #96, M1).
 *
 * The router's default codec does not hand a reader the text a planner typed. `?verified=1` arrives
 * as the **number** `1`, `?q=true` as the **boolean** `true`, `?q=[1,2]` as an **array** — so every
 * reader in this app that tested `typeof value === 'string'` was silently discarding real input and
 * falling back to a default. Four helpers had each worked that out separately and answered it
 * differently; this is the one they now share.
 *
 * **Two mechanisms, not one, and the difference decides the remedy.** Three docblocks in this
 * repository said "the default `parseSearch` is `parseSearchWith(JSON.parse)`, which JSON-parses
 * every value". Half true. The **decode** step coerces `"true"`, `"false"` and canonical numeric
 * strings (`qss.js:41-46`) **before** the parser is consulted, and `JSON.parse`
 * (`searchParams.js:18-30`) only ever sees values that are still strings. So a "parser that leaves
 * values alone" would not fix `?verified=1` — which is why the epic's remedy replaces the codec
 * rather than the parser, and why this helper is needed in the meantime.
 * Recorded executably in `apps/web/src/app/router-search.characterisation.test.ts`.
 *
 * **What it cannot repair**, because the loss happens before it runs: a value whose `String()` does
 * not reproduce the source is already gone. A 32-digit token parses to `1.2345678901234567e+31` and
 * re-stringifies to *that*, not to the token. Pinned in `router-search.test.ts` so the limit is
 * visible rather than assumed away.
 *
 * **The array case is deliberate, and it is where the four helpers disagreed.** `?q=a&q=b` decodes
 * to `['a', 'b']` (`qss.js:55-65`). `asSearchString` took the first element; `readForeignParam`
 * returned `undefined` and dropped the param entirely. The union is right: a repeated param is a
 * planner writing the same key twice, and answering with their first value beats answering with
 * nothing.
 */
export function searchString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // A nested array is not a shape the codec produces, and the recursion terminates on the first
  // element either way — an empty array has none, so it falls through to `undefined`.
  if (Array.isArray(value) && value.length > 0) return searchString(value[0]);
  return undefined;
}
