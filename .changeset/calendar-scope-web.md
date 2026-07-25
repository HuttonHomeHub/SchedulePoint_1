---
'@repo/web': minor
---

feat(web): the calendar scope tier in the UI — project calendars, tier-aware pickers (ADR-0053, M2, behind `VITE_LIBRARY_SCOPING`)

The organisation/project calendar split that shipped dark in M1 gets its web surface, behind the new
compile-time flag `VITE_LIBRARY_SCOPING` (off by default). With it on:

- **Calendar library** — each row shows a `Scope` badge (Organisation, or `Project: <name>`), and an
  Organisation · Project · All filter reads the API's `?scope=` list.
- **Project → Calendars** — a project's detail screen gains a Calendars section listing what that
  project's plans can actually be scheduled on (its own calendars plus every organisation one),
  with a "New calendar" that defaults to the project.
- **Creating** a calendar gains a scope choice. The shared organisation library additionally
  requires `calendar:manage_org`; without it the option is disabled with a plain explanation
  instead of silently missing.
- **Moving tiers** — promote a project calendar into the shared library, or narrow a shared one to a
  project. A narrowing the server refuses now reads as, e.g., "Still used by 2 plans and 3
  activities outside it — reassign them to another calendar first", not a bare error code.
- **Pickers** — the plan and per-activity calendar pickers offer the project's own calendars
  alongside the organisation's, grouped and labelled by tier. The resource picker stays
  organisation-only and says so, because the resource pool is shared across every project.

Frontend only: every endpoint, permission and error code behind it shipped with M1, and the CPM
engine is untouched. With the flag off every touched screen renders exactly as before and every
calendar list requests the same URL it always did.
