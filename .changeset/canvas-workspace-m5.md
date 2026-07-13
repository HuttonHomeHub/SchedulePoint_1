---
'@repo/web': minor
---

fix(web): canvas-first plan workspace — M5 review fixes (a11y/perf/ux) (ADR-0030)

Fold in the blocking findings from the accessibility, UX and performance reviews of the canvas-
first workspace (still off by default behind `VITE_CANVAS_WORKSPACE`; frontend only):

- **a11y** — the mobile Diagram/Activities view toggle is now a proper `radiogroup` of two
  `radio`s with roving `tabIndex`, arrow/Home/End keys and a 44px target; on collapse/expand the
  panel moves focus onto the reciprocal control instead of dropping to `<body>`; menu items get a
  visible `focus:` ring (WCAG 1.4.11); a single consolidated pen read-only note replaces the two
  duplicated notes.
- **perf** — `formatCalendarDate`/`formatTimestamp` reuse module-scope `Intl.DateTimeFormat`
  singletons instead of constructing a formatter per call; the activity listbox descriptions are
  memoized; the panel resizer coalesces pointer moves onto a single `requestAnimationFrame`.
- **ux** — a "Plan details…" read surface (available to every role) exposes the status/planned-
  start/description the slim header omits; the loading state renders a workspace-shaped skeleton so
  the load→loaded transition doesn't jump; header breadcrumbs restored.
