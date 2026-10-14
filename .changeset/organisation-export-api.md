---
'@repo/api': minor
---

An Org Admin can export everything an organisation holds: `POST /organizations/{orgSlug}/export` streams one ZIP of JSON and CSV files (clients, projects, plans, activities, links, calendars, resources, baselines, notes, history, share links, members and the audit log, including the recycle bin), a plain-English `README.txt` and a `manifest.json` with every file's row count, size and checksum. It never includes passwords, sign-in sessions, invitation or share-link tokens, or the audit log's IP addresses and browser details. One export runs at a time per organisation (a second answers 409), three are allowed per ten minutes (then 429), nothing is stored on the server, and every export is recorded in the audit log as `privacy.exported`. The route has no screen yet; the format is described in `docs/ORGANISATION_EXPORT_FORMAT.md`.
