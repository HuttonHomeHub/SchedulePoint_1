---
'@repo/web': minor
---

feat(web): schedule-export surface in the TSLD Export menu (ADR-0050 M4d)

Add a web entry point so a planner can download a plan as a foreign schedule file, behind the (already-on)
`VITE_SCHEDULE_INTERCHANGE` flag.

- **Export menu items** — the canvas **Export ▾** menu gains an "Interchange" group with **Primavera P6
  (XER)** and **Microsoft Project (MSPDI)**, after the existing CSV/PNG/PDF/Print items (no second menu),
  matching the sibling items' uppercase-acronym labels. Both show a loading spinner and disable while an
  export is in flight (guarding a double-click). The whole group renders only when the
  `VITE_SCHEDULE_INTERCHANGE` flag AND the caller's `interchange:export` permission are both true — the
  latter is held by every member (Viewer upward), so most users see it. Flag-off / permission-off ⇒ the
  menu is byte-for-byte the Stage-C1 set.
- **Download client** (`features/interchange/api/use-export-plan.ts`) — a cookie-authenticated `GET` that
  reads the response as a Blob, parses the `Content-Disposition` filename (quoted / unquoted / RFC 5987 /
  fallback) and the `X-Interchange-Report` header (JSON, validated against the shared
  `@repo/interchange` Zod schema, tolerating its absence), then triggers a browser download. Pure parsing
  is split from the IO for unit-testing; non-2xx maps to `ApiFetchError` + friendly copy (403/404/422/offline).
- **Report surfacing** — after a successful download the outcome is announced politely. When the export
  approximated/dropped anything (notably MSPDI), a **visible, dismissible info notice** appears beside the
  toolbar with a **"Download report"** button — the report is offered on click (with export-direction copy)
  rather than auto-downloaded, since the browser's multi-download guard can silently block a second
  download. A clean export shows no persistent notice.

The CPM engine, the pure `@repo/interchange` package, and `apps/api` are untouched — this is a
frontend-only download surface over the already-live export endpoint.
