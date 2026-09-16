---
'@repo/web': minor
'@repo/api': minor
---

The clients list can be searched. It was the only one of the three organisation lists with no way
to narrow it — 123 clients is six and a half screens of scrolling with nothing to type into — and
the search now works the way the calendars and resources libraries already do: case-insensitive,
in the URL so a narrowed view survives a reload and can be pasted to a colleague, with the same
always-present `Clear filters` beside it.

The API gains an optional `q` on the clients list. Sending nothing returns exactly the page it
returned before.
