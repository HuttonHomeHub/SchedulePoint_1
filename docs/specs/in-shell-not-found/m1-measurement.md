# M1-T0 measurement: today's behaviour under `/orgs/<slug>/…`

- **Taken:** 2026-10-07, before any product change, on branch `feat/in-shell-not-found` at the
  approved spec tip (`9dc891bb`). Local API + Vite dev server through the `e2e-public` Playwright
  config, Chromium 1920x1080-class desktop, a **throwaway** probe spec (deleted; this file is the
  only artefact). Three accounts' worth of data: a member `M` with organisation `own`, a second
  account's organisation `foreign` (M is not in it), and a slug that does not exist.
- **Question:** does spec 0.2 hold ("read, not measured": in `notFoundMode: 'root'` no `beforeLoad`
  below the root runs for an unmatched path)? If a reading contradicted it, the build stops.
- **Result: 0.2 holds. No reading contradicts the spec.**

## Cold loads (`page.goto`), settled after 2.5 s

| Identity (path)                    | Settled URL                                 | Title                            | `<main>` | `<h1>`                             | Focus  | `/api/v1` requests                                              |
| ---------------------------------- | ------------------------------------------- | -------------------------------- | -------- | ---------------------------------- | ------ | --------------------------------------------------------------- |
| member `/orgs/own/nope`            | unchanged                                   | `Page not found · SchedulePoint` | 1        | Page not found                     | the h1 | `GET /me` only                                                  |
| non-member `/orgs/foreign/nope`    | unchanged                                   | same                             | 1        | Page not found                     | the h1 | `GET /me` only                                                  |
| nonexistent `/orgs/gone/nope`      | unchanged                                   | same                             | 1        | Page not found                     | the h1 | `GET /me` only                                                  |
| reference `/no-such-path`          | unchanged                                   | same                             | 1        | Page not found                     | the h1 | `GET /me` only                                                  |
| signed out `/orgs/own/nope`        | unchanged                                   | same                             | 1        | Page not found                     | the h1 | `GET /me` only                                                  |
| signed out `/no-such-path`         | unchanged                                   | same                             | 1        | Page not found                     | the h1 | `GET /me` only                                                  |
| member `/orgs/own/members`         | unchanged                                   | `SchedulePoint`                  | 1        | Members                            | body   | `/me`, `/organizations`, clients, version, members, invitations |
| non-member `/orgs/foreign/members` | `/orgs/own` (redirect via `/`)              | `Own … · SchedulePoint`          | 1        | the member's own organisation name | body   | `/me`, `/organizations`, clients, version, overview             |
| nonexistent `/orgs/gone/members`   | `/orgs/own` (redirect via `/`)              | same                             | 1        | same                               | body   | same as the foreign row                                         |
| signed out `/orgs/own/members`     | `/sign-in?redirect=%2Forgs%2Fown%2Fmembers` | `Sign in · SchedulePoint`        | 1        | Sign in                            | body   | `GET /me` only                                                  |

## Client-side arrival (history push from inside the app, member of `own`)

`/orgs/own/nope`, `/orgs/foreign/nope` and `/no-such-path` all settle to the same root picture
(title `Page not found · SchedulePoint`, one `<main>`, one `<h1>`, no shell `role="tree"`) with **no
request at all**.

## What this establishes

- Spec 0.2: an unmatched path under `/orgs/<slug>/` never runs `_authed`'s guard nor
  `ensureOrgMembership` today; only the session probe (`GET /me`, from root) is requested, and no
  `GET /organizations`. The signed-out unmatched picture is the not-found page, so the Q1(a) change
  to sign-in is a real, visible change, as the spec says.
- Foreign and nonexistent slugs are already indistinguishable for both shapes today (SC-2's baseline).
- The real-route shape (`/members`) redirects a non-member home, as 0.5 says (here to `/orgs/own`
  because `M` has an organisation, via the home resolver).
