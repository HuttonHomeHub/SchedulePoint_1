---
'@repo/web': patch
---

Fix the TSLD ruler's overprinted month label. When the viewport starts a day or two before a month
boundary, the pinned "which month am I looking at" label and the boundary's own label were drawn a
few pixels apart and ran together (`JuAug`). The pinned label now sits at the left edge where it
belongs, and stands down when the real boundary would overprint it.
