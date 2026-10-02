---
'@repo/interchange': patch
'@repo/api': patch
'@repo/web': patch
---

An import report now truncates an over-long code, name or sentence from the uploaded file instead of passing it through unbounded. The import dialog's layout and calendar checkboxes report themselves busy while the dry-run re-runs. A tooltip on a trigger in a very short window no longer covers the trigger when neither side has room for it.
