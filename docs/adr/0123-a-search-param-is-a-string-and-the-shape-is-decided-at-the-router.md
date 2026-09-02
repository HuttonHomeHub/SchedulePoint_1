# ADR-0123: A search param is a string, and the shape is decided at the router

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** web
- **Amends:** ADR-0004 (URL state), ADR-0005 (TanStack Router)
- **Builds on:** ADR-0053 M6 (typed URL filter state), ADR-0074 M5 (the defect that found this),
  ADR-0088 D1 (why there is no flag), ADR-0095 M5 (the Gantt view memory)
- **Register row:** `docs/TECH_DEBT.md` #96
- **Spec:** [`docs/specs/router-search-params/`](../specs/router-search-params/)

## Context

TanStack Router's default search codec **types** values. `?verified=1` reaches a route validator as
the number `1`; `?q=true` as a boolean; `?q=a&q=b` as an array. Eighteen params across eleven
screens are read in this application, every one through `useSearch`, which is typed `unknown` at
every call site — so every reader had to decide what a non-string means, and four of them had each
decided separately.

The defect is not hypothetical and was not found by review. ADR-0074 M5 shipped a verification
screen that rendered "still waiting" **after a verification that had succeeded**, because
`?verified=1` arrived as a number and a `typeof search.verified === 'string'` test discarded it. It
was invisible to the unit suite by construction: every screen test mocks `useSearch` and hands the
component a literal, so none of them crosses the parser at all. Only the flag-on journey, following
a real emailed link through a real redirect, could see it.

That was patched at three routes with a coercion helper, and the register row #96 recorded the rest
as owed work. This epic is the rest — and reading the dependency changed the shape of the remedy.

### The mechanism, corrected (F1)

**Three docblocks in this repository said the coercion is `parseSearchWith(JSON.parse)`, "which
JSON-parses every value". That is half the mechanism, and the missing half decides the remedy.**

The **decode** step coerces `"true"`, `"false"` and canonical numeric strings
(`@tanstack/router-core` `qss.js:41-46`) **before** any parser is consulted, and `JSON.parse`
(`searchParams.js:18-30`) only ever sees values that are still strings. So the obvious minimal fix —
`parseSearchWith(v => v)`, "a parser that leaves values alone", which is what #96's own text
proposed — **would not have fixed `?verified=1` at all.** The helper has to go, not its argument.
This is recorded executably in `apps/web/src/app/router-search.characterisation.test.ts`, whose 23
codec assertions were written from that reading and then run: all 23 passed first time, which is the
strongest available evidence that the reading is sound, because the prediction was committed before
the run.

### The merge, measured (F5)

`validateSearch`'s return is **added to** the parsed search, not substituted for it
(`router.js:685-696`), and `useSearch` returns `match.search` whatever `strict` is set to
(`useSearch.js:21-23`). Two consequences, both established against a real `createRouter` over a real
memory history rather than read off the source:

1. **A validator cannot remove a param.** A route declaring nothing still shows a consumer every key
   the URL carried, already coerced.
2. **A validator cannot rename one either** — its output lands beside the source key, not in place
   of it. That was _not_ what the reading predicted, and it is what makes the per-route alternative
   unarguable rather than merely awkward.

Seven of the eighteen params are declared by **no validator at all** — `gsort`, `ghide`,
`gcollapsed`, `categories`, `outcome`, `from`, `to` — and work only because of that merge.

### Where the damage actually is (M3's failed prediction)

The M3 suite was written as "the library pair loses some of this corpus and ours does not", and went
red on `expected 0 to be greater than 0`. **The library pair round-trips everything it wrote
itself**, the 32-digit token included: its stringifier re-quotes exactly the values its parser would
coerce, so the pair is self-consistent.

So the defect is confined to search strings **this application did not compose** — a link Better
Auth built, a URL a planner typed or edited, a bookmark from another tool. Those meet the parser with
no matching stringifier behind them. Both recorded symptoms are of that kind, and so is every
symptom this epic measured.

## Decision

**We will replace the router's search codec, not defend against it at eighteen call sites.**

- **D1 — `parseSearch` and `stringifySearch` are replaced together, in one commit.** They are one
  contract: replacing the parser alone leaves the stringifier re-quoting `'2026'` on the way out, and
  `parseLocation` re-stringifies every location into every link built from it
  (`router.js:183-194`), so a mismatched pair shows up as a URL that rewrites itself. They are
  **router-level** options (`router.js:634-635`) — there is no per-route override — which is why this
  is two lines and why it could never have been done route by route.
- **D2 — a repeated key resolves to its first value**, matching `URLSearchParams.get`. Today it
  arrives as an array and fifteen of the eighteen readers fall to a default. An array is the shape
  that forces every reader to grow a branch for something nothing in this application wants.
- **D3 — the parser returns a null-prototype object**, mirroring the library's `decode`
  (`qss.js:55-65`). Three screens test `'x' in search` rather than truthiness, and
  `Object.prototype` would answer `true` for `'toString'`.
- **D4 — no unquoting shim for stale bookmarks.** A bookmark saved from the old app holds
  `?q=%222026%22` and now reads as the six-character string `"2026"`. A shim that stripped the quotes
  would permanently corrupt a term a planner genuinely typed with quotes, to tidy a bookmark that
  self-heals on the next keystroke. The cost is stated, not engineered away.
- **D5 — the coercion readers stay, as a safety net rather than the mechanism.** `useSearch` is typed
  `unknown` at every call site, so a total reader is the only thing that makes those call sites
  honest, and they are the rollback contract if the two options are ever reverted. Deleting them
  would look like tidying and would quietly remove both.
- **D6 — a non-string handed to the stringifier is a development-time error and `String(v)` in
  production.** TypeScript already prevents it at every call site; this catches somebody widening a
  validator's return type, and it fails at a desk rather than mid-navigation in front of a planner.
- **D7 — no feature flag** (ADR-0088 D1). A `VITE_` constant is inlined at build time and has never
  been an operator rollback; the flip is two lines and the rollback is a revert.
- **D8 — two structural gates, and they cover different halves.** Gate A censuses **routes**: a route
  declaring `validateSearch` with no case composing the router's real parser with that route's real
  validator fails `pnpm test`. Gate B censuses **readers**, which Gate A structurally cannot see,
  because seven params reach their readers through the merge and not through any validator.

## Alternatives considered

- **`parseSearchWith(v => v)`** — the register row's own proposal, and the one this epic set out to
  build. It does not work: the decode step coerces before the parser is reached (F1). Rejected on
  measurement, not on taste.
- **Per-route coercion, leaving the codec alone** — the shape #96 implies. Rejected on F5: a
  validator's output is added to the parsed search rather than substituted for it, so a route that
  sanitised its own keys would leave every other key on the match exactly as the codec produced it,
  and the seven undeclared params would have no route to sanitise them at all.
- **Keep the four coercion helpers, unify nothing** — rejected at M1: they had already disagreed
  about the array case (one took the first element, one dropped the param), and a disagreement
  between two total readers is invisible until somebody hits the case both were written for.
- **An unquoting shim for legacy bookmarks** — rejected as D4.
- **A `VITE_` flag** — rejected as D7.

## Consequences

**Positive.**

- The defect class becomes unreachable by construction rather than defended against at eighteen call
  sites — including in the one case no reader could ever have repaired: a value whose `String()` does
  not reproduce the source. A 32-digit token now arrives verbatim; `router-search.test.ts` carried an
  assertion pinning the opposite for two years, with its own comment naming this remedy.
- URLs become legible and retypable. `?signedOut=%22true%22` becomes `?signedOut=true`, and a typed
  `?q=2026` filters the library instead of silently doing nothing.
- Four coercion helpers became one before the flip, so the safety net is one rule rather than four
  opinions.
- Two census gates make the next route and the next reader a decision somebody records rather than a
  thing somebody remembers.

**Negative, and accepted.**

- A bookmark saved before this ships shows its quotes once (D4).
- The whole product's URL serialisation changed in one commit. That is mitigated by the M0 oracle,
  M2's eight per-route cases, M3's differential written before the flip existed, the full journey
  sweep, and a one-line revert — not by staging, which is impossible for an atomic option.

**Neutral.**

- `lib/router/search-string.ts` is now unreachable through the router for every branch but the first.
  Kept deliberately (D5).
- `router-search.characterisation.test.ts` still characterises the **library's** codec by name, and
  not one of its assertions moved at the flip. That is correct: it is the record of why the codec was
  replaced, and it survives the replacement. A section at its foot asserts what the router actually
  holds, reached through `router.options` rather than by importing the module, so removing the two
  options from `createRouter` fails there rather than passing quietly.

**Follow-up.** `/forgot-password?email=` is a specified capability with no producer — read at
`routes/forgot-password.tsx`, specified in the account-security spec, and written by nothing in
`apps/web/src` or `apps/api/src`. Filed rather than fixed here (ADR-0081's shape, one layer below a
screen).

## The number

Filed as **0123**. The plan said ADR-0122, and that number was taken between the plan being written
and this being filed — by the WBS band's text equivalent, on the same day. Recorded rather than
routed around, which is the lesson ADR-0071 (a decision cited by shipped code and never filed) and
ADR-0079 (the same collision, one number along) both exist to teach, and which the plan itself cited
in advance.

## References

- `docs/TECH_DEBT.md` #96 — the register row, and its own half-right mechanism sentence.
- [`docs/specs/router-search-params/`](../specs/router-search-params/) — spec, plan, and the M0
  measurement with its verdict rule committed before the probes ran.
- ADR-0074 M5 — the live defect that found this.
- `scripts/dependency-claims.json` — the thirteen `@tanstack/*` citations this decision rests on. A
  bump of either package fails CI and forces them to be re-read, which is exactly when they need it
  (ADR-0076).
