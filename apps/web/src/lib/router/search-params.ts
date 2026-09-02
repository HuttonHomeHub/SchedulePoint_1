/**
 * **The router's search codec, replaced: values stay strings** (`docs/TECH_DEBT.md` #96, M3).
 *
 * **Unwired on purpose.** M3 ships this dark — exported, exercised by its own suite, and imported by
 * nothing else. M4 hands the pair to `createRouter`'s `parseSearch`/`stringifySearch` options in one
 * commit, because they are one contract: replacing the parser alone leaves the library's stringifier
 * re-quoting `'2026'` on the way out (`searchParams.js:43-62`), and replacing the stringifier alone
 * leaves the parser coercing on the way back in.
 *
 * **What is wrong with the defaults, in the form that decides the remedy.** Three docblocks in this
 * repository say "the default `parseSearch` is `parseSearchWith(JSON.parse)`, which JSON-parses
 * every value". That is half the mechanism, and the missing half is the load-bearing one: the
 * **decode** step coerces `"true"`, `"false"` and canonical numeric strings (`qss.js:41-46`)
 * **before** the parser is consulted, and `JSON.parse` (`searchParams.js:18-30`) only ever sees
 * values that are still strings. So `parseSearchWith(v => v)` — the obvious minimal fix, and the one
 * the register row proposed — would still deliver `?verified=1` as the number `1`. The helper has to
 * go, not its argument.
 *
 * **Where the damage actually is, measured rather than assumed.** The library pair is
 * *self-consistent*: its stringifier re-quotes exactly the values its parser would coerce, so it
 * never loses a value it wrote itself — the M3 suite's first version predicted otherwise and went
 * red proving it. The defect is confined to search strings **this app did not write**: a link
 * Better Auth composed, a URL a planner typed or edited, a bookmark from another tool. Those meet
 * the parser with no matching stringifier behind them, and that is where `?verified=1` became the
 * number `1` (ADR-0074 M5) and where a hand-typed `?q=2026` vanished (#96 M1).
 *
 * **What this fixes that no reader can.** `lib/router/search-string.ts` repairs values whose
 * `String()` reproduces the source. A foreign 32-digit token becomes `1.2345678901234567e+31`
 * inside the codec, before any reader runs, and is gone. Here it is never parsed at all, so it
 * arrives verbatim.
 *
 * **What it costs, stated rather than engineered away** (D4). A bookmark saved from today's app
 * holds `?q=%222026%22`, and this pair reads that as the six-character string `"2026"` — quotes
 * included — because it does not unquote. A shim that stripped them would permanently corrupt a term
 * a planner genuinely typed with quotes, to tidy a bookmark that self-heals on the next keystroke.
 */

/** Keys whose value is `undefined` are omitted, matching what the library's stringifier does. */
export type SearchRecord = Record<string, string | undefined>;

/**
 * Parse a location's search string into plain strings.
 *
 * @param search the raw search, with or without its leading `?`.
 * @returns a **null-prototype** object (D8), mirroring `decode` (`qss.js:55-65`), so `'x' in search`
 *   keeps working at `verify-email.tsx`, `reset-password.tsx` and `accept-invite.tsx` — those three
 *   test membership rather than truthiness, and an `Object.prototype` would answer `true` for
 *   `'toString'`.
 *
 * A repeated key resolves to its **first** value (D3), which is `URLSearchParams.get` semantics.
 * Today `decode` builds an array and fifteen of the eighteen readers fall to a default; an array is
 * the shape that forces every reader to grow a branch for something nothing in the app wants.
 */
export function parseSearchStrings(search: string): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query === '') return out;
  for (const [key, value] of new URLSearchParams(query)) {
    // First value wins: `URLSearchParams` yields every pair, so skip a key already taken.
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/**
 * Serialise a search record back to a query string.
 *
 * @returns `''` for an empty record — **not** `'?'` — which is what the library emits and what
 *   `parseLocation` re-stringifies into every link built from a location (`router.js:183-194`).
 *
 * A non-string value is a **development-time error and `String(v)` in production** (D9, the
 * ADR-0121 painter precedent). TypeScript already prevents it at every call site, because every
 * validator's declared return is `{ …?: string }` and both URL-state hooks are typed
 * `Record<string, string | undefined>`; this catches somebody widening one of those types, and it
 * throws in development rather than mid-navigation in front of a planner.
 */
export function stringifySearchStrings(search: SearchRecord): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      if (import.meta.env.DEV) {
        throw new TypeError(
          `stringifySearchStrings received a ${typeof value} for "${key}". Search values are ` +
            `strings (docs/TECH_DEBT.md #96, D9); coerce at the call site so the URL says what you ` +
            `meant.`,
        );
      }
      params.set(key, String(value));
      continue;
    }
    params.set(key, value);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
