---
'@repo/web': minor
---

Repair four blocking defects on the pre-authentication screens (ADR-0077 M1). Visually unchanged.

- **Six states that offered nothing to press now offer something.** The resend confirmation stops
  unmounting the form it confirms — it told the reader to "check your spam folder before trying
  again" and removed the thing to try again with, on three surfaces. The invitation screens for a
  missing token, an unknown invitation and a spent invitation gain a way into the app; **wrong
  account** gains the Sign out its own copy instructs, which it had never had.
- **Accept and join keeps focus while it works.** It used the native `disabled` attribute, which
  blurs to `<body>` when the request starts and flips back when it settles, so a keyboard user lost
  their place twice per action (WCAG 2.4.3). It is now `aria-disabled` with a guard that prevents
  the double submit.
- **A rate-limited reader is told what happened.** Better Auth's 429 carries no error code, so every
  auth screen fell through to the library's own sentence in a bare red paragraph. All six auth
  mutations now carry the HTTP status, and one shared message says "too many attempts" — naming no
  number of seconds, because the header carrying one is discarded by the fetch client before the
  error reaches us.
