---
'@repo/api': patch
---

The redundant-links health check now also lists a link whose other route passes through an activity that starts together with the next one, when that activity shares the first activity's calendar. Removing the link was already shown to change no date or float; the check was withholding it.
