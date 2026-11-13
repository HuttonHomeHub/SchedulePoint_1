/**
 * **One spelling of one rule: how a search param becomes a string** (`docs/TECH_DEBT.md` #96, M1).
 *
 * The router's default codec does not hand a reader the text a planner typed. `?verified=1` arrives
 * as the **number** `1`, `?q=true` as the **boolean** `true`, `?q=[1,2]` as an **array** — so every
 * reader in this app that tested `typeof value === 'string'` was silently discarding real input and
 * falling back to a default. Four helpers had each worked that out separately and answered it
 * differently; this is the one they now share.
 *
 * **Since #96 M4 this is a SAFETY NET, not the mechanism — and it stays** (D5). The router now
 * carries `lib/router/search-params.ts`, so every value reaches a reader as a string and every
 * branch below except the first is unreachable through the router. They are kept, with their unit
 * cases, for two reasons: they are the rollback contract if the codec pair is ever reverted (one
 * line each in `createRouter`), and `useSearch` is typed `unknown` at every call site, so a total
 * reader is the only thing that makes those call sites honest. Deleting them would look like
 * tidying and would quietly remove both.
 *
 * **Two mechanisms, not one, and the difference decides the remedy.** Three docblocks in this
 * repository said "the default `parseSearch` is `parseSearchWith(JSON.parse)`, which JSON-parses
 * every value". Half true. The **decode** step coerces `"true"`, `"false"` and canonical numeric
 * strings (`qss.js:41-46`) **before** the parser is consulted, and `JSON.parse`
 * (`searchParams.js:18-33`) only ever sees values that are still strings. So a "parser that leaves
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

/**
 * A `?redirect=` that is safe to push, or `undefined`.
 *
 * **Same-origin by shape** (`docs/TECH_DEBT.md` #102(1)). The value is spent as
 * `router.history.push(search.redirect ?? '/')`, and until this check it was whatever the URL said.
 * It has never been exploitable through the History API alone, because `pushState` throws on a
 * cross-origin URL, but that is a property of the browser and not of this code.
 *
 * The rule is one leading slash and not two: `/plans/1` is ours, `//evil.test` is a
 * protocol-relative URL the browser resolves to another origin (as is `/\evil.test`, which browsers
 * normalise to `//evil.test`, hence the backslash is refused in second place too), and
 * `https://evil.test` is not a path at all. **Whitespace and control characters are refused
 * anywhere in the value**, because URL parsing strips tab and newline: `/\t/evil.test` reads as a
 * path here and as `//evil.test` to the browser. A malformed value is DROPPED rather than repaired,
 * and the fallback is `/`.
 *
 * **Every reader applies it, not only the route's `validateSearch`.** The router merges the raw
 * query into a non-strict `useSearch`, so a key the validator drops can still reach a component that
 * reads `useSearch({ strict: false })`; found on `/sign-up` in the browser, where `?redirect=//evil.test`
 * was spent unvalidated.
 */
export function sameOriginRedirect(value: unknown): string | undefined {
  const requested = searchString(value);
  if (requested === undefined) return undefined;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  return /^\/(?![/\\])/.test(requested) && !/[\u0000-\u0020\u007f]/.test(requested)
    ? requested
    : undefined;
}
