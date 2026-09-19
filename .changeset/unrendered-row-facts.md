---
'@repo/web': minor
---

Clients says when each client was created, and both Members sections say how many rows they hold.

Three facts the product already had and never showed. `ClientSummary.createdAt` has been on the
wire throughout, and after the description moved under the client's name the Clients table was a
name at one end and an `Edit ⋯` at the other — measured at **1012px of unused width, 80% of the
row**, with no second fact anywhere on it. It now carries a `Created` column.

On Members, both the roster and the pending-invitation sections now state their size beside their
title. Each count is the **total**, not "rows loaded so far", because both lists page fully before
rendering — which is the condition that makes stating a number honest.

The column was gated on four conditions committed before anything was measured, and the one that
could have failed landed exactly: the table's spare width falls by **147px, precisely the new
column's width**, so the date is paid for out of emptiness and no other column was squeezed.
