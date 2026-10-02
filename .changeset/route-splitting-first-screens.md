---
'@repo/web': patch
---

Slow screens now show a loading skeleton instead of a blank page. The account, sign-up, password-reset, email-verification, invitation and onboarding screens, and the signed-in app frame, now download only when they are opened. If a download fails, for example because the app was updated while a tab was open, "Try again" reloads the page and says so, rather than doing nothing.
