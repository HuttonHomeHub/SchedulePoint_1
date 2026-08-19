---
'@repo/api': minor
'@repo/web': minor
---

"Jump back in" — the organisation landing now offers the plans you were recently working in.

Up to five, most recent first, for **every** role: it is the one personalised section a Viewer or
Contributor gets, because it is your own history rather than a list of things to act on. Opening a
plan puts it at the top; opening one already listed moves it rather than adding it twice.

It costs **no extra request** — the remembered ids ride on the overview call the landing already
makes (`?recentPlanIds=`), which is what made it acceptable on the first screen after every sign-in.

The browser remembers **ids only, never a name**. That is what makes a renamed plan show its
current name, a deleted one simply disappear, and a plan you have lost access to vanish silently
rather than 404 when you click it. The list is per-account and cleared when you sign out, so a
shared machine never hands the next person your plan names.
