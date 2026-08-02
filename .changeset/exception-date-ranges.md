---
'@repo/api': minor
'@repo/web': minor
'@repo/types': patch
---

One calendar exception can cover a shutdown, instead of fourteen separate days

`calendar_exceptions` has stored a **range** since the table was created — `start_date`, `end_date`,
and a Postgres exclusion constraint over `daterange(start_date, end_date, '[]')` to stop two
exceptions overlapping — the read DTO has always returned `endDate`, and the CPM engine has always
scheduled across the whole span. Only the write paths collapsed it, so a Christmas fortnight, a
two-week turnaround or a plant shutdown had to be entered as ten to fourteen separate one-day
exceptions, one at a time, on a schema and a read model that both described the range the planner
actually meant (surface audit F2).

The exception editor now takes **From** and **To (optional)** — empty still means a single day,
which is what a date on its own has always meant, so nothing a planner already knows how to enter
changes. Existing exceptions read back exactly as before.

An exception's **last** day is also editable. Its **first** day still is not: moving an exception is
indistinguishable from deleting one and adding another, which the neighbouring actions already do
visibly — but extending a shutdown by two days is not moving anything, it is the edit a planner most
often needs, and the alternative is the delete-then-recreate the edit endpoint exists to remove
(there is a window in between during which a holiday is an ordinary working day, and a
recalculation landing in it schedules work).

A range that ends before it starts is a 422 naming both dates — an empty range is the one shape the
overlap constraint cannot express, because it overlaps nothing. A span that would collide with the
next exception along is the same 409 as adding a duplicate day, from the same translation of the
same constraint. A span longer than 10,000 days is refused: a year typed as 2226 rather than 2026 is
a typo, and it is also the bound the engine's calendar build now relies on, since it expands each
exception once per recalculation and the "single day, so O(E)" premise no longer holds.
