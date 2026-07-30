---
'@repo/web': minor
---

Give every canvas authoring tool the same way out. The Add split-button's primary region now arms
and disarms the tool (it previously only opened its kind menu, while the neighbouring Link button
armed — two adjacent controls doing different things on the same click, on a surface where the
armed tool decides what the next canvas click means). Arming and closing the Add and Link tools is
now announced, so the change is not conveyed only by a label on a control you may not be looking at.
