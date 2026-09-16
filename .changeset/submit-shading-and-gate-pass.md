---
'@repo/web': patch
'@repo/api': patch
---

Seventeen buttons visibly dim again while they are saving. Converting them away from the browser's
own disabled attribute — so that pressing Save with the keyboard no longer throws you to the top of
the page twice per save — silently took the greying-out with it, because the styling was attached to
that attribute and nothing else. Since then, pressing Save, Create or Sign in changed one word and
gave no other sign that anything was happening. All six sign-in and account forms were affected.

The clients list now says how many clients your search found. Both other library screens have
announced that for months and this one never did, so anyone using a screen reader typed into the
search box and heard nothing at all.

Clearing a search from the "no clients match this search" message no longer loses your place on the
page. The same fix applies on the calendars and resources libraries.

Changing a colleague's role on the Members screen keeps your place while it saves, and a second
change made before the first finishes is ignored rather than queued.

The audit log and My activity announce what they record to a screen reader while the "What this
records" section is still closed. They did not before: a collapsed disclosure is skipped when a
browser works out a description, so the rule was only ever announced once it was already on screen.
