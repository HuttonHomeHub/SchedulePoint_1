---
'@repo/web': patch
---

Fix the post-login redirect bouncing back to the sign-in screen. After a
successful sign-in/sign-up the session query was only _invalidated_, which does
not refetch an inactive query, so the `_authed` route guard — which reads the
session via `ensureQueryData` (cached, no revalidation) — saw the stale
unauthenticated `null` and redirected straight back to sign-in. The user
appeared "stuck" and only got in by manually refreshing. The mutations now
`fetchQuery` the session (awaited) so the cache holds the logged-in user before
navigation, landing the user in the app (or onboarding) on the first attempt.
