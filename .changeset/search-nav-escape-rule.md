---
'@repo/web': minor
---

Search navigation: an Escape typed into the search field belongs to the field, and one keystroke
says one thing.

The flag-on journey (`apps/web/e2e-search-nav/`, its own CI step) found two live defects on its
first run — both invisible to every unit suite in the repository, because neither is observable
without a real browser, a real API and two debounces running against each other:

- **An armed tool was lost to a keystroke aimed at text.** The canvas's Escape handler is a native
  `window` listener, so it fired wherever focus was: a planner refining a search query with the Link
  tool armed had the tool silently disarmed. The listener now ignores keys typed into a text control,
  and the field takes a two-step Escape of its own — clear the query, then hand focus to the diagram —
  so the route to Escape's other meaning stays open rather than becoming a dead end.
- **The jump announcement was overwritten by a stale filter count.** Both speak into the same polite
  live region, and the debounced count re-armed on every re-render, landing after the jump. A
  screen-reader user heard "3 of 5 activities match" where the product had just said which activity it
  had moved to. The count now stands down once the planner starts cycling, and clearing the search
  says "Search cleared." instead of blanking the region.

The feature stays behind `VITE_CANVAS_SEARCH_NAV` (default off). The CPM engine is not imported and
the ADR-0034 recalculation parity gate is untouched.
