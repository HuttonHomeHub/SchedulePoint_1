---
'@repo/web': minor
---

feat(web): flip `VITE_LIBRARY_SCOPING` on by default — calendar project tier, resource hierarchy, archive and search go live (ADR-0053, M6)

The library-scoping epic's web surface is now **on by default**. Everything below shipped dark
across M1–M5 and was reachable only by setting the flag; from this release it is what planners see:

- **Calendars have a project tier.** A calendar belongs either to the shared organisation library or
  to one project. The library screen shows each row's tier and filters by it; a project's detail
  screen lists exactly what its plans can be scheduled on; creating a calendar from a project
  defaults to that project; and a calendar can be promoted to the shared library or narrowed to a
  project (a narrowing that would strand other work is refused with the counts that explain why).
  Plan and activity pickers group their options by tier, so a picker can never offer a calendar the
  server would reject. The resource picker stays organisation-only, because the resource pool is
  shared across every project.
- **Resources nest.** A non-assignable `Group` kind plus a parent picker turn the flat pool into a
  browsable tree, without fragmenting the single shared pool that cross-plan over-allocation and
  levelling depend on.
- **Both libraries can be archived and searched.** Archiving retires a calendar or resource from the
  pickers **without touching anything already using it** — every existing plan, activity and
  assignment keeps scheduling exactly as before. That distinction is stated on screen next to every
  archive control, badged on every archived row, and reversible from the same place. Search and the
  filters are server-side and now live in the URL, so a filtered view survives a reload and can be
  shared as a link.
- **Every picker pages properly.** The shared searched combobox replaces the raw dropdowns, closing
  the defect where a library of more than 20 rows was silently truncated in every picker. "Load
  more" is reachable by keyboard as well as pointer.
- **Imports no longer pollute the shared library.** A `.xer`/`.xml` import tiers its calendars to the
  target project by default; an Org-Admin-level importer can opt the file's global calendars into
  the shared library from a checkbox in the import review dialog, which re-runs the dry-run so the
  report always describes the import being confirmed.

Frontend only — no API, schema or CPM-engine change, so the schedule-recalculation parity gate is
untouched. Set `VITE_LIBRARY_SCOPING=false` for a byte-for-byte rollback to the previous surface.
