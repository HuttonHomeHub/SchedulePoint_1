---
'@repo/web': minor
---

Add the flagged schedule-import **review UI** (ADR-0050, Stage C2 M1). Behind the dark
`VITE_SCHEDULE_INTERCHANGE` flag (and the `interchange:import` permission), a project's plan-create
surface gains an **Import from file…** entry that opens a two-phase review dialog: pick a Primavera P6
`.xer` → the app **dry-runs** it (parse-only, no write) and renders the returned report (mapped
counts + approximation / repair / drop findings, downloadable) → **Confirm import** commits it (creates
the plan server-side, recalculates) and opens the new plan on the TSLD canvas. Client-side size guard,
friendly mapping of the server's 422 reject / 413 oversize / network failures, and a fixed
display-only target project. **Accessibility (WCAG 2.2 AA):** the file-input error is linked to the
control (`aria-invalid` + conditional `aria-describedby`), the resolved dry-run report and the
committed import are announced via the shared polite live region (4.1.3), the commit phase shows a
`role="status"` spinner, and the mapped-counts list carries an accessible group name. Flag-off leaves
the plan-create surface byte-for-byte unchanged.
