---
'@repo/web': patch
---

Project Explorer: say what arrived when a level finishes loading.

Expanding a client or a project fetches its children, and until now the only way to learn the fetch
had finished was to see the rows appear — so a screen-reader user got nothing unless they happened
to be standing on the placeholder when it vanished. The tree now announces the outcome ("11 projects
loaded", "No plans.", "Couldn't load plans.") through the app's polite live region, which is what
ADR-0029 specified and nothing had implemented.
