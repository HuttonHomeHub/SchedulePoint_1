---
'@repo/api': minor
---

The recycle bin's 90-day clear-out can now be previewed before it is switched on, and a restore can no longer lose to it. Run `docker compose exec api node dist/cli/clear-out-preview.js` in the stack folder to list, without changing anything, every deleted client, project and plan that is past its period (what the first run would permanently remove), what falls due in the next 7 days, and whether the clear-out is on or off on this server. Nothing is switched on: `RETENTION_HIERARCHY_ENABLED` still defaults to `false`. When the clear-out is off, the API log's `hierarchy_expiry.disabled` line now also says how many items are already past their period. When the clear-out is on, an item restored while a run is in progress is no longer deleted, and a restore that loses that race now leaves no "restored" entry in the audit log. The "Permanently deleted" audit entry now also records how many history entries went with the item.
