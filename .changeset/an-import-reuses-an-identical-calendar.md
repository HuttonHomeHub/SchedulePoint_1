---
'@repo/api': minor
---

Importing a schedule into a project now reuses an existing calendar when a copy would differ only in its name, instead of creating `<name> (imported <date>)` every time. The calendar must be active, unarchived, in the same tier and project, carry the file's name or the importer's own variant of it, and match in hours per day, weekly shifts and exceptions (dates, windows and labels). The review report names each reuse as a repair, and the `interchange.imported` audit event records `calendarsReused`. A calendar that differs in anything, or is archived, is still created as before. See ADR-0208.
