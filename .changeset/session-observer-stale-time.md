---
'@repo/web': patch
---

Stop re-asking the server who is signed in every time part of a screen appears. Screens that only show the signed-in user now reuse that answer for up to 30 seconds, like the rest of the app's data, so opening another plan no longer costs a request. Signing in, signing up and changing a password still fetch it fresh.
