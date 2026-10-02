---
'@repo/web': minor
---

The app now loads far less code before the sign-in screen appears. Every screen, including the plan workspace, the client and project screens, the libraries and the administration screens, now downloads only when it is opened, so the first visit's JavaScript falls from about 464 kB to about 180 kB. Slow screens show a loading skeleton instead of a blank page, and the screens you are most likely to open next are fetched in the background after you sign in. If a download fails, for example because the app was updated while a tab was open, "Try again" reloads the page and says so, rather than doing nothing.
