---
'@repo/types': minor
'@repo/api': minor
'@repo/web': minor
---

feat: record where an imported programme came from in the audit log

Importing a schedule now writes an audit event naming the file, the format, how many activities and
links arrived, and how many findings the import report raised.

A plan somebody built is a sequence of choices with a person behind each one. An imported plan
arrived whole, from a file, and the file is not kept — so a week later nothing distinguishes five
hundred imported activities from five hundred typed ones, and "where did this programme come from?"
had no answer at all. Now it does, with a name and a time against it.

A dry-run records nothing: it reads a file and changes nothing. A failed import records nothing
either — including one that gets as far as creating the plan and is then rolled back.

This completes the audit log's mutation coverage. Every route in the API is now either audited or
explicitly and permanently excluded for a stated reason; there is no longer any route parked as
"we'll decide later".
