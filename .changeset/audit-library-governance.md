---
'@repo/types': minor
'@repo/api': minor
'@repo/web': minor
---

feat: record what the shared calendar and resource libraries offer in the audit log

Seven new events (ADR-0073 C3.3): a calendar deleted, retired, restored to use or moved between the
shared and project tiers, and a resource deleted, retired or restored.

**Retiring is the change this exists for.** An archived calendar or resource keeps scheduling
exactly as it did, keeps every plan and assignment already using it, and refuses only a _new_ use.
Nothing breaks and nobody is told — so the first anybody hears of it is a colleague asking why they
can no longer pick something they used last month. That question now has an answer with a name and
a time against it.

Retiring and restoring are separate events rather than one with a flag, because the question a
reader asks is "what was retired?". A single edit that changes a calendar's working week _and_ its
tier records both, linked together, so neither fact hides inside the other. Deleting a resource
group records one event carrying how many resources went with it, not one per resource.

The web copy says "retired" rather than "archived" throughout, because nothing was deleted.
