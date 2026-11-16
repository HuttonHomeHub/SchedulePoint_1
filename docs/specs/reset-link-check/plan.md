# Implementation Plan: A reset link says on arrival whether it still works

- **Spec:** [`spec.md`](spec.md) · **Status:** Approved by the product owner, 2026-11-16 (ADR-0131)
- **Epic:** reset-link-check · **Size:** small (two milestones, one PR each, or one PR with two commits)
- **Flag:** none (ADR-0088 D1). Rollback is the commit boundary: M1 alone is inert (an endpoint nobody
  calls); reverting M2 restores today's learned-on-submit page.
- **Entry point (ADR-0081):** the emailed link `/reset-password#token=…`; journey `apps/web/e2e-account/account.spec.ts`.
- **Reviewers:** security-reviewer + api-reviewer (M1); accessibility-reviewer + ux-reviewer (M2).
  No database-architect: no schema change.
- **Changesets:** `@repo/api` minor (new endpoint), `@repo/web` minor (user-visible behaviour).

## M1 — `POST /api/v1/password-reset/check` (API only; `main` stays releasable, nothing calls it)

| Task          | Steps                                                                                                                                                                                                                                                                                                                                | Cx  | Risk                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ----------------------------------------------------------- |
| T1 DTO        | `common/auth/dto/check-password-reset.dto.ts`: `{ token }` `@IsString() @IsNotEmpty() @MaxLength(2048)` (copy the confirm DTO's bounds); response DTO `{ usable: boolean }` for OpenAPI.                                                                                                                                             | S   | —                                                           |
| T2 Service    | `PasswordResetCheckService.isUsable(token)`: `const ctx = await auth.$context`; `findVerificationValue('reset-password:'+token)`; `false` if null or `expiresAt < new Date()`; else `findUserById(value) !== null`. No logger injected; no token in any thrown message. Docblock cites K1–K7 (spec §3) and why not `handler`/Prisma. | S   | `$context` coupling — pinned by e2e and the claims register |
| T3 Controller | `@Controller({ path: 'password-reset', version: '1' })`, `@Post('check') @Public() @Throttle({ default: { ttl: 60_000, limit: 10 } }) @HttpCode(200)`, `@ApiOkResponse`, `@ApiBadRequestResponse`, `@ApiTooManyRequestsResponse`. Register both in `AuthModule`.                                                                     | S   | path must not sit under `organizations` (census)            |
| T4 Census     | `audit-coverage.structural.spec.ts` → `UNAUDITED_ROUTES['POST /api/v1/password-reset/check'] = REASONS.READ`.                                                                                                                                                                                                                        | XS  | —                                                           |
| T5 Docs       | `docs/API.md` section beside "Confirming an email address"; claims already registered (spec K1–K7).                                                                                                                                                                                                                                  | XS  | —                                                           |

**Tests (M1).**

- Unit `password-reset-check.service.spec.ts`: null row → false; expired row → false; live row, user
  missing → false; live row + user → true; adapter throws → rethrown with no token in the message;
  never calls `consumeVerificationValue` (spy).
- API e2e, a new `describe` in `apps/api/test/password-reset.e2e-spec.ts` (it already mints real tokens
  via the mail sink, `tokenFromLastEmail`): fresh token → `{ usable: true }`; **checked three times and
  then the reset POST still succeeds** (does not consume); after that reset → `false`; expired (set the
  row's `expiresAt` in the past via Prisma, matching on `hashToken('reset-password:'+T)`) → `false`;
  random unknown token → `false`; user gone (point the row's `value` at a missing id) → `false`; the four
  `false` bodies are deep-equal; empty / missing / 2049-char token → 400; no `audit_events` row written.
  Rate limit in its own `describe` run last (or its own file): 10 × 200 then 429.
- `pnpm prepush` + `scripts/e2e-local.sh api`.

## M2 — the page checks on arrival (web)

| Task            | Steps                                                                                                                                                                                                                                                                                                                                                                                                                                | Cx  | Risk                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---------------------------------------------------- |
| T1 Hook         | `features/auth/api/use-reset-link-check.ts`: `useQuery` per spec §3 (key includes token, `retry: false`, `gcTime: 0`, `staleTime: Infinity`, `enabled: token !== ''`), `apiFetch('/password-reset/check', { method: 'POST', body })` → `usable`. Export from `features/auth`.                                                                                                                                                        | S   | token in query key — memory only, no persister       |
| T2 Screen       | `routes/reset-password.tsx`: states NoToken / Checking / Invalid-on-arrival / Form / Rejected-on-submit / Changed. Checking = `AuthShell` "Choose a new password" + one sentence, `aria-busy`. Invalid-on-arrival = existing invalid shell + `Alert purpose="condition"` "This link has already been used or has expired." Error → form. `useDocumentTitle` follows the heading. Rewrite the "learned on submit" docblock paragraph. | S   | stale result after `hashchange` — avoided by the key |
| T3 Public suite | `apps/web/e2e-public/support.ts:76-80` row `#token=e2e`: stub `**/api/v1/password-reset/check` → `{ data: { usable: true } }` for that row (precedent `public-screens.spec.ts:168`), so the form keeps its brand/axe coverage.                                                                                                                                                                                                       | XS  | forgetting it reds the public shard                  |
| T4 Docs         | TECH_DEBT #537: dated note "arrival cost removed by `docs/specs/reset-link-check/`". ADR-0074 line 508: dated in-place amendment + §16 suffix ("reset arrival check 2026-11-16"). `docs/DECISIONS.md` line. Spec status → Approved with citation.                                                                                                                                                                                    | XS  | —                                                    |

**Tests (M2).**

- Unit `reset-password.test.tsx` (mock `apiFetch` beside the existing `authClient` mock): checking state
  shows the sentence and no fields; `usable: true` → form; `usable: false` → invalid heading + condition
  alert (no `role="alert"`), no form; check rejects (500, network, 429) → form; then submit rejected →
  existing event alert, focused; `hashchange` to a new token → re-check, old result not reused; exactly
  one request per token; the request body carries the token and the URL does not.
- Journey `apps/web/e2e-account/account.spec.ts`:
  - First arrival: wait for the **New password** field (the heading also shows while checking), assert
    the check request's URL has no token (`page.waitForRequest`).
  - **Race (keeps C6 real):** open `resetUrl` in a second context and see the form _before_ the
    stranger submits; after the stranger's reset succeeds, submit in the second context → "That link is
    no longer valid", event alert focused. This replaces today's spent-link-on-submit block (`:175-188`).
  - **Spent link on arrival:** `goto(resetUrl)` → "That link is no longer valid" without touching the
    form; New password field count 0; condition text; axe.
  - Legacy link block (`:194-201`): the spent token now lands on the invalid screen, not the form; update
    the comment ("the redirect does no lookup; the page's check does").
- `pnpm prepush` + `scripts/e2e-local.sh web:account` and `web:public`.

## Definition of done

Both milestones merged; journey green locally and in CI (dedupe per §19.9); security, api, a11y, ux
reviews with blocking findings fixed; changesets; docs in M2-T4; `pnpm check:claims` green.

## Risks

| Risk                                                             | Mitigation                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$context`/`internalAdapter` shape changes on a Better Auth bump | K5–K7 registered (`check:claims` fails on a moved anchor); the e2e cases fail loudly — and the web degrades to today's behaviour (form) on a 500 |
| The copied predicate drifts from the POST's                      | e2e used/expired/unknown/user-gone against the real library                                                                                      |
| Timing differs between "expired row lingering" and "no row"      | reveals nothing about a user or email, only about a token the caller already holds; accepted                                                     |
| A reader on a slow link sees "Checking your link…" briefly       | one sentence in the settled shape (ADR-0202); fallback to form on failure                                                                        |
| Public-screens shard goes red                                    | M2-T3                                                                                                                                            |
