---
'@repo/api': minor
---

The revision comparison now compares where bars are drawn. A bar moved by placement alone — its
network dates unchanged — is reported as re-dated and its ghost sits at the old placed span, when
every baseline in the comparison recorded its placement. A baseline captured before placement was
recorded falls back to earliest against earliest, as before. Both comparison routes gain a
`datesBasis` field (`PLACED` or `NETWORK`) saying which dates the read compared, chosen once per read.
