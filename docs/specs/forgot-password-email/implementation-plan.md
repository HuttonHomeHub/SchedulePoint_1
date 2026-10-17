# Implementation Plan: `/forgot-password?email=` — retire the param nothing writes (#242)

- **Status:** Approved — with [`spec.md`](spec.md), 2026-10-17, option (b)
- **Spec:** [`spec.md`](spec.md)
- **Date:** 2026-10-17
- **Assumes:** Q1 = **(b) delete**. If the owner picks (a) or (c), this plan is withdrawn and rewritten;
  a sketch of (c) is in §"If Q1 is answered differently" so the cost is visible now.

## Breakdown

### Epic

Make the `/forgot-password` route contract, its screen and its specification agree, by removing the
`?email=` prefill that nothing produces. One milestone, one PR, `@repo/web` patch.

### Milestone M1: delete the unproduced prefill (shippable slice)

**Entry point (ADR-0081).** No new capability, so nothing to declare dark. The existing journey
`apps/web/e2e-account/account.spec.ts:93-124` already drives sign-in → "Forgot your password?" →
typed address → confirmation through the real product and must stay green **unchanged** — it is the
proof that removing the prefill broke no path somebody uses.

#### Feature F1 — route and screen

- **T1. Remove the validator.** `apps/web/src/app/router.tsx:585-588` — delete `validateSearch` from
  `forgotPasswordRoute`; update the shared docblock at `:572-581` ("permissive on both" → only
  `/reset-password` parses search). _Complexity:_ S. _Deps:_ none. _Risk:_ typed-router fallout if any
  caller passes `search` to this route — grep shows none (`sign-in.tsx:35`, `reset-password.tsx:58`).
- **T2. Stop reading search on the screen.** `apps/web/src/routes/forgot-password.tsx:1,29-30,89` —
  drop `useSearch` and the `email` local; render `<RequestPasswordResetForm request={request} />`.
  _S._ _Deps:_ T3 (prop removal) in the same commit.
- **T3. Narrow the form's props.** `apps/web/src/features/auth/components/RequestPasswordResetForm.tsx:37-53`
  — remove `email?`; `defaultValues: { email: '' }`. Only caller is T2; `message-once.test.tsx:38`
  already passes none. _S._ _Risk:_ public-contract narrowing of an exported component
  (`features/auth/index.ts:6`) — one caller, verified by grep.

#### Feature F2 — tests and gates

- **T4. Invert the unit case.** `apps/web/src/routes/forgot-password.test.tsx:51-54` — replace
  "prefills the address from ?email=" with "does not prefill from ?email=" (render with
  `{ email: 'ada@example.com' }`, expect the field empty). Keeps AC2 pinned. The `useSearch` mock at
  `:12-19` may stay (harmless) or go; default: remove it and `renderScreen`'s `params` argument, since
  the screen no longer calls it. _S._
- **T5. Router codec suite.** `apps/web/src/app/router-search.test.ts:165-177` — delete the
  `/forgot-password search params` block (no validator left to exercise). _S._
- **T6. Gate A census.** `apps/web/src/app/router-search-census.structural.test.ts` — remove
  `'/forgot-password'` from `KNOWN_VALIDATORS` (`:78-88`); "nine" → "eight" at `:75` and `:124`.
  `EXPECTED_ROUTE_COUNT` (`:94`) stays 24 — the route remains. The docblock's red-verification
  narrative at `:41-45` is history and stays, with a one-line note that the cited case was later
  removed. _S._ _Risk:_ A3 compares the full validator list with `toEqual`, so forgetting T6 fails
  loudly — that is the gate working.
- **T7. Gate B census.** `apps/web/src/app/search-consumer-census.structural.test.ts:80,84` — delete
  the `routes/forgot-password.tsx` entry (B3 at `:154-159` refuses it once the file stops reading
  search) and change "All nine validators" → "All eight". _S._
- **T8. Confirm unchanged.** No edit expected, run and confirm:
  `routes/public-screens.landmarks.test.tsx:111-121` (mounts without `email`),
  `features/auth/password-reset.parity.test.tsx:74-79` (exact `href` `/forgot-password`),
  `features/auth/components/SignInForm.test.tsx` (`SignInForm` untouched),
  `e2e-csp/csp.spec.ts:146-157`, `e2e-public/support.ts:74`, `e2e-account/account.spec.ts:97-117`
  (all navigate to bare `/forgot-password`). _S._

#### Feature F3 — documentation

- **T9. Amend, don't rewrite, the approved spec.** `docs/specs/account-security/feature-spec.md:805`
  and `:308` — append "_(withdrawn 2026-10-xx: no producer; see `docs/specs/forgot-password-email/`)_".
- **T10. Close the row.** `docs/TECH_DEBT.md` #242 → `closed`, fix stated at the top of the row
  (house style, `TECH_DEBT.md:1898-1902`). One line in `docs/DECISIONS.md` recording (b) and why.
  ADR-0123's "Follow-up" (`:154-157`) gains "closed by #242's spec" — an ADR is amended, never edited
  away.
- **T11. Changeset.** `@repo/web` patch: "The password-reset request screen no longer reads an
  `?email=` parameter that nothing in the app produced."

**Testing requirements (milestone).** `pnpm prepush` (lint, typecheck, unit incl. both census gates,
`check:*`), plus `scripts/e2e-local.sh web:account` and `web:csp` and the public suite, since their
routes are touched. No `apps/api` change, so no API e2e required.

**Reviewers.** component-reviewer (prop narrowing on an exported form), security-reviewer (light
confirmation that no address path was added — expected to be a short review). accessibility-reviewer
not required: no keyboard, focus or markup change. No database-architect: no schema.

## Sequencing & slices

One commit is the slice — T1–T8 must land together, because T3 without T2 fails typecheck and T1
without T6/T7 fails the census gates. T9–T11 ride in the same PR. `main` is releasable after it.

## Definition of Done (per task)

Code + tests in the same commit; `pnpm prepush` green locally; the three e2e suites above run locally;
row #242 closed with evidence; changeset present; CI checks read per CLAUDE.md §19.9 before merge.

## Risks & assumptions (rollup)

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| An external system (support email template, docs site, password manager) links `?email=` | Low — grep of repo finds none; Better Auth targets no such route (`TECH_DEBT.md:1916-1917`) | AC2: the link still works, it just does not prefill |
| Owner later wants the kindness | Medium | Specify (c) then, against a measured drop-off (ADR-0142) |
| Census docblocks drift ("nine") | Low | T6/T7 edit them in the same commit; A3's `toEqual` fails on any miss |

## If Q1 is answered differently (sketch only, not approved scope)

- **(c) navigation state** — M1: `SignInForm` gains `onEmailChange?: (email: string) => void`
  (driven from `watch('email')`), `SignInForm.test.tsx` adds a case; `sign-in.tsx` holds the value and
  passes it as `Link` `state`; `forgot-password.tsx` reads router location state instead of search;
  route `?email=` deleted as in (b) (T1, T5–T7 still apply). Requires registering the TanStack `state`
  claim in `scripts/dependency-claims.json`; `account.spec.ts` gains "type on sign-in → link →
  field prefilled → URL has no `email`". accessibility-reviewer not needed; component-reviewer and
  security-reviewer are. Roughly 2–3× (b).
- **(a) URL + strip** — as (c) but `search: { email }`, plus the `reset-password.tsx:40-47` capture/strip
  pattern; the route validator stays. Not recommended: the strip races the first same-origin fetch
  (spec §3), and no test tier here can observe the Referer it is meant to prevent.
