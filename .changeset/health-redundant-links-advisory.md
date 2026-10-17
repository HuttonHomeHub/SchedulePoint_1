---
'@repo/api': minor
---

The health check now lists redundant links under "Beyond the DCMA assessment": links already
implied by a longer chain, so that deleting one cannot change any activity's dates or float whatever
the durations. It also counts the links it could not check, and says when a very large plan stopped it
early. The fourteen DCMA rows and the summary are unchanged. The report's `advisories` entries are now
discriminated on `id`, and the new row's denominator is the plan's relationships.
