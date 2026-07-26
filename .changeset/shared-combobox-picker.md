---
'@repo/web': minor
---

feat(web): a shared searchable picker, plus library search and archive (ADR-0053, M4)

A new shared **combobox** replaces the plain dropdowns used to pick a calendar, a resource or a
resource group. It searches the server as you type, pages the rest in on demand, groups options by
tier, and annotates them ("Project", "Archived") — so choosing from a library of hundreds is
typing, not scrolling.

- Full keyboard operation and screen-reader support (WAI-ARIA combobox pattern): arrows, Home/End,
  Enter, Escape, an announced result count, and disabled options that stay discoverable without
  being selectable.
- The current selection is always shown, even when a search or filter has hidden it — a picker can
  never silently blank out what you already chose, and an archived selection keeps its badge.
- The calendar and resource libraries gain a search box, a "Show archived" toggle, a kind filter,
  and Archive / Unarchive row actions with wording that makes clear an archived row still
  schedules — it is retired from the pickers, not deleted.

All of it sits behind `VITE_LIBRARY_SCOPING`, which remains off by default: with the flag off the
screens and pickers behave exactly as before.
