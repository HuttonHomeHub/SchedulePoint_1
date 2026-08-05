---
'@repo/web': patch
---

The Content-Security-Policy now has a test that proves it, instead of relying on someone watching a
browser console.

The policy was written by reading our own code and checked by walking the app with the console open.
Neither of those can see what a third-party library does when it runs — which is exactly what the
one real violation on the live site turned out to be. So the check is now automatic: the app is
built the way it is deployed, served with the same policy the container serves (read from the
deployment file rather than copied), driven through the sign-in screens and the signed-in app, and
any violation fails the build. It was confirmed to catch the original problem before being trusted.

It deliberately does not cover everything yet — image export and the printed programme are still
walked by hand — and says so, rather than implying more coverage than it has.
