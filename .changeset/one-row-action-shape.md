---
'@repo/web': minor
---

Every list offers a row's actions the same way: the primary action stays visible and the rest move
behind a `⋯`, which is what the calendars table has done since the shape was decided and what five
other tables each did differently. Deleting a client, project, plan or resource is now two presses
rather than one — the buried action is the destructive one, which is where a moment's friction is
cheapest.

`Clear filters` now lives in the calendars and resources filter bars rather than only appearing once
a filter has matched nothing, so narrowing 81 calendars to three has a way back. It is always
present and shaded when there is nothing to clear, so pressing it never moves your place.

Three empty-state `Clear filters` buttons now name what they clear. Two controls whose accessible
name was the bare string, both on screen at once, were indistinguishable to anyone hearing them
rather than seeing where they sit — including on the audit log, where that had been true since its
filter bar shipped.
