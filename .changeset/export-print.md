---
'@repo/web': minor
---

feat(web): TSLD export & print on by default (VITE_EXPORT_PRINT)

Turn the two "Coming soon" TSLD-toolbar placeholders (`export`, `print`) into real
client-side deliverables — no API/schema/`@repo/types`/CPM-engine change (the recalc
parity gate is untouched):

- **Export ▾** — a grouped APG menu: **Schedule / All activities (CSV)** (Excel-safe,
  formula-injection-guarded, UTF-8 BOM) with a conditional **Matching activities only
  (N)** item when a filter/isolate lens narrows the set; **Diagram — whole plan /
  current view** as both **PNG** (off-screen `paintScene` in a light print palette)
  and **PDF** (lazy `import('jspdf')`, absent from the initial bundle). Each output
  carries a distinct filename, announces "Preparing…" then its outcome, and raises a
  visible banner on failure.
- **Print…** — a browser print of the whole diagram via a print-only container +
  `@media print` stylesheet.

Set `VITE_EXPORT_PRINT=false` to restore the toolbar, canvas paint and a11y tree
byte-for-byte (rollback / opt-out); no export module or jsPDF chunk loads. `share`
and XER/MSP interchange are deferred to C2; app-handled `Ctrl/Cmd+P` is a deferred
fast-follow.
