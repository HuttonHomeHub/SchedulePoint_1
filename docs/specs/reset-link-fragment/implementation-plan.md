# Implementation Plan: The reset link carries its token in the fragment

- **Status:** Approved — by the product owner, 2026-10-21, with all defaults
- **Tracking:** `docs/TECH_DEBT.md` #537 · **Size:** S (two milestones, ~1 day)

**Epic:** a newly emailed reset token never appears in a URL any server sees; old links still work.
Each milestone keeps `main` releasable. Agents: **builder** (Sonnet) implements; **security-reviewer**
is mandatory before M2 merges; api-reviewer, accessibility-reviewer, test-engineer as listed. No
database-architect run — no schema change.

## M0 — Register the dependency claims (XS; no deps)

- **T1** Re-read R1–R6 (spec §4.1) in the installed `better-auth@1.7.10`; add entries to
  `scripts/dependency-claims.json` with anchors, `citedBy` the spec and (from M2) `better-auth.ts` /
  `app-setup.ts`. Extend existing `password.mjs:74/82` entries' `citedBy` rather than duplicating.
- **Test:** `pnpm check:claims`.
- **Risk:** line drift on a Better Auth bump — the gate exists for exactly that.

## M1 — The page accepts a fragment (S; deps M0). Inert: no email produces one yet.

Ships first so a lagging web image never meets a new-shape link (the verify epic's M1 reasoning).

- **T1** `apps/web/src/routes/reset-password.tsx`: `tokenFromHash()`; `useState` initialiser prefers
  `#token`, falls back to `?token` (still produced by the unshadowed library route until M2);
  `hashchange` listener (`verify-email.tsx:225-234` shape); strip with the existing `navigate(…replace)`.
  Rewrite the docblock (`:16-21`) to describe the fragment and the legacy shadow.
- **T2** A6: on submit error with `code` `INVALID_TOKEN` / `USER_NOT_FOUND`, render the existing
  "That link is no longer valid" state; focus via `useOutcomeFocus`. Confirm `AuthError.code` carries
  the library code (`use-session.ts:381-387`, `codeFrom`).
- **T3** Unit (`reset-password.test.tsx`): hash capture, hash stripped, hashchange, query fallback,
  A6 for each code, 429/network unchanged.
- **T4** `e2e-public/support.ts`: add a `/reset-password#token=e2e` state beside the `?token=` one.
- **Review:** accessibility-reviewer (A6 focus move), component-reviewer only if the form's API changes.
- **Risk:** low. A6 changes copy-on-error for today's links too — that is intended.

## M2 — Switch the link and shadow the old route (S; deps M1). The entry point (ADR-0081).

- **T1 API composition.** `CreateAuthOptions.resetPageUrl` + docblock; `sendResetPassword({ user, token })`
  composes `${resetPageUrl}#token=${encodeURIComponent(token)}`; wire in `auth.module.ts` from
  `config.appUrl`. Update the `sendPasswordReset` docblock (`better-auth.ts:68-77`).
  Test: `better-auth.spec.ts` — composed URL, library `url` ignored.
- **T2 Legacy shadow.** `app-setup.ts`: `express.get('/api/auth/reset-password/:token', …)` after the
  verify shadow, before `:125`; 303 to `#token=` or `?error=INVALID_TOKEN`; `no-store`, `no-referrer`;
  docblock citing #537 and R2. Consider extracting a shared `fragmentRedirect(page, token)` helper
  used by both shadows (builder's call; no behaviour change to verify).
- **T3 Web cleanup.** Drop the `?token` fallback from M1; `router.tsx:594-598` keeps only `error`;
  update `router-search.test.ts:82-84` and the search censuses; drop `redirectTo` from
  `useRequestPasswordReset` and its docblock (`use-session.ts:349-359`); `support.ts:77` `?token=e2e`
  state removed (the `#token` one from M1 stays).
- **T4 API e2e** (`password-reset.e2e-spec.ts`): `tokenFromLastEmail` reads the fragment; legacy
  `GET`/`HEAD` → 303 fragment Location + headers; the token still resets after the legacy GET (no
  consume); unusable token → `?error=INVALID_TOKEN`; POST without `redirectTo` still 200.
- **T5 Playwright** (`e2e-account/account.spec.ts`, `test:e2e:account`): the emailed link is
  `/reset-password#token=`, never `/api/`; fragment gone after arrival; a legacy-shape URL built from the
  same token lands on the form; spent-link leg submits and sees A6; axe on A6.
- **T6 Docs.** `docs/TECH_DEBT.md` #537 → resolved with evidence; `docs/DECISIONS.md` entry; ADR-0074
  reset-section note; `docs/API.md` if it documents the reset link shape; changeset **minor** for
  `@repo/api` and `@repo/web`.
- **Review:** **security-reviewer (blocking)**, api-reviewer (shadow status/headers), test-engineer.
- **Risks.** (a) Image skew: API new + web older than M1 → link lands on a page that ignores `#token`
  and shows "no longer valid"; mitigated by M1 shipping first. (b) `appUrl` misconfigured → the link
  points nowhere; the same value already serves invitations and verification, so a misconfig is already
  visible. (c) Shadow shadows more than intended — A7's e2e (POST still works) pins it.

## Gate

`pnpm prepush`; `scripts/e2e-local.sh api`; `scripts/e2e-local.sh web:account`;
`scripts/e2e-local.sh web:public`. Nothing in this plan requires the owner to test, measure or check
anything on a server or device: every acceptance criterion is asserted by a suite above.
