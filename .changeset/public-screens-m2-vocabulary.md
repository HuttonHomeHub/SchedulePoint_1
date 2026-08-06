---
'@repo/web': minor
---

One vocabulary across the six pre-authentication screens (ADR-0077 M2).

- **A server failure now looks at least as serious as a typo.** "Enter a valid email" rendered in a
  bordered, tinted block; "too many attempts" or "wrong password" rendered as a bare red sentence,
  in six hand-assembled copies. Both are now the same `ServerError` primitive, which announces
  itself and takes focus once.
- **The heading is part of the state.** `/reset-password` kept "Choose a new password" as its
  heading over a body that had already told the reader their password was changed. Each screen's
  route now owns its terminal state, heading and all. `/forgot-password` also gains the loading
  branch it was missing — it used to paint the signed-out form and then replace it.
- **One name for one action** — "Create an account", which had been "Create one", "Create account"
  and "Create your account" depending on where you stood. The primary action on a screen is always
  a button; the inline link is one shared style with a visible focus ring it never had.
- **One card width.** The sign-in card was 384px and the invitation card 448px, so signing in and
  then accepting an invitation resized the card for no reason a reader could name.
- Every public screen is now `noindex`, including the invitation screen, which carries a live token
  in its URL.
