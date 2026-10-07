# M3-T0 — measurement before the change (2026-10-07)

Taken on branch `fix/one-page-not-found` **before any M3 code**, against a real API (the e2e Nest app
over the migrated `app_test` database, `STAFF_EMAILS=ops@schedulepoint.test`) and the real Vite dev
server driven by Chromium (`/opt/pw-browsers/chromium-1194`). Two throwaway specs (an api e2e spec and a
Playwright journey under the staff config's servers) took the readings and were deleted; the
permanent assertions are in `apps/api/test/not-found-body.e2e-spec.ts` and `e2e-staff/staff.spec.ts`.

## API — a signed-in **non-staff** member (verified account, no staff allow-list entry)

| Request                           | Status | Body                                                                                | content-length |
| --------------------------------- | ------ | ----------------------------------------------------------------------------------- | -------------- |
| `GET /api/v1/x`                   | 404    | `{"error":{"code":"NOT_FOUND","message":"Cannot GET /api/v1/x"}}`                   | 63             |
| `GET /api/v1/staff/no-such-route` | 404    | `{"error":{"code":"NOT_FOUND","message":"Cannot GET /api/v1/staff/no-such-route"}}` | 81             |
| `GET /api/v1/staff/me`            | 404    | `{"error":{"code":"NOT_FOUND","message":"Not found"}}`                              | 52             |
| `POST /api/v1/staff/me`           | 404    | `{"error":{"code":"NOT_FOUND","message":"Cannot POST /api/v1/staff/me"}}`           | 71             |

All four: `content-type: application/json; charset=utf-8`, and an identical set of security headers
(CSP, COOP, CORP, `x-content-type-options`, `x-frame-options`, HSTS, `referrer-policy`, …). Spec §0.4
holds: **status yes, body no** — the unmapped routes echo the method and the path.

Two readings the spec did not list, neither of which contradicts its design:

- `GET /api/v1/staff/me` alone carries `x-ratelimit-limit: 30`, `x-ratelimit-remaining`,
  `x-ratelimit-reset` — the staff controller's throttle (§2 residue "30/min throttle"). Unmapped routes
  carry none. It is the same cause as the already-accepted 429, so it joins that residue line rather
  than being claimed away; the parity assertion compares every header **except** `x-ratelimit-*`,
  `x-correlation-id` (a fresh uuid per request) and `date`.
- `POST /api/v1/staff/me` has **no handler**, so it is an unmapped route (Nest 404) and never reaches
  `StaffGuard`: it is `Cannot POST …` today, and `Not found` after T2 like the other two.

Anonymous, for the residue list: `GET /api/v1/staff/me` → **401** `{"code":"UNAUTHENTICATED","message":"Unauthorized"}`;
the other three are 404 as above.

## Web — before (`/staff` is the only styled picture)

| URL (signed in, non-staff) | title                       | `<main>`  | `<h1>`      | link                                                                           | focus |
| -------------------------- | --------------------------- | --------- | ----------- | ------------------------------------------------------------------------------ | ----- |
| `/no-such-path`            | `SchedulePoint`             | 0         | none        | none (`<p>Not Found</p>`)                                                      | body  |
| `/staff`, `/staff/`        | `Not found · SchedulePoint` | 1         | "Not found" | "Go to SchedulePoint" → /                                                      | body  |
| `/staff/x`                 | `SchedulePoint`             | 0         | none        | none                                                                           | body  |
| `/orgs/<slug>/nope`        | `SchedulePoint`             | 1 (shell) | none        | shell navigation                                                               | body  |
| `/orgs/<slug>/plans/abc/x` | `SchedulePoint`             | 1 (shell) | none        | shell navigation (fuzzy-matched the plan route, which asked `GET …/plans/abc`) | body  |

Signed out: `/no-such-path` and `/staff/x` — the same two-word page; `/staff`, `/staff/` — the styled
page (the identity probe answers 401, which the screen folds into "not found"); **`/orgs/acme/nope` and
`/orgs/acme/plans/abc/x` redirect to `/sign-in?redirect=%2Forgs%2Facme%2Fnope`** (spec §0.3 confirmed:
`_authed`'s `beforeLoad` runs first). The router logged the library's own warning
("a notFoundError was encountered on the route with ID `__root__` … nor was a router level
`defaultNotFoundComponent` configured") for every one.

## `apiFetch` has no global 401 → sign-in redirect

`grep -n "401\|sign-in\|window.location" apps/web/src/lib/api apps/web/src/lib/query/query-client.ts`
(non-test) finds only two comments; `apiFetch` throws `ApiFetchError` and nothing navigates. The one
place a 401 becomes navigation is `_authed`'s `beforeLoad` (`router.tsx:253`). So no API 401 adds a tell
to the not-found screen, as spec §2 says.

## Conclusion

Every reading agrees with the spec's design. M3 proceeds as written; the one addition is the
`x-ratelimit-*` residue above.
