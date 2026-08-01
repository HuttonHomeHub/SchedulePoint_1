---
'@repo/seed-http': patch
---

Bound the server-supplied text the seeder puts in its report.

The raw-text fallback already clamped to 200 characters; the parsed-envelope branch passed `code`,
`message` and `details` through verbatim. `--out` writes those to disk, so a seeder pointed at a
broken or hostile endpoint could spend the operator's disk one finding at a time.

Found while re-reading the flow for CodeQL's `js/http-to-file-access` alert (TECH_DEBT #81). It does
not clear that alert and was not done to: the taint flow is unchanged, and the alert is still
assessed as a false positive for that call site. This is the one genuine defect in its
neighbourhood — the size, not the path or the quoting.
