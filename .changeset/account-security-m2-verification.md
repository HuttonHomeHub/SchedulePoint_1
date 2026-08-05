---
'@repo/web': minor
---

Close the three email-verification dead ends and add the `/verify-email` landing screen
(ADR-0074 M2).

With `AUTH_REQUIRE_EMAIL_VERIFICATION` enabled on the API, sign-up returned no session and the
client reported success then bounced the new member to sign-in with no explanation; sign-in
answered 403 with the library's raw message and no way forward; and the invitation-accept card
held `emailVerified` without ever reading it. All three now branch on **runtime evidence the
server provides** — which is why they ship unflagged: a `VITE_` constant is baked into the bundle
long before an operator sets that env var, so a flag would strand every new sign-up on a flag-off
bundle against a flag-on server.

`/verify-email` is a landing screen (it never holds or spends a token) registered unconditionally,
and a spent link is framed as "used — here is a fresh one" rather than as a failure, because a
mail scanner following the link can burn it before the person clicks it. `AuthShell` and
`InviteShell` converge on one shell that mounts the shared announcer, so a public screen can
announce at all. Both auth submits move from native `disabled` to `aria-disabled` plus a submit
guard, so focus is not thrown to `<body>` and back on every attempt.
