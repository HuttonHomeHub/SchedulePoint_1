---
'@repo/web': patch
---

The select boxes in the activities table are finger-sized on a touch screen: the box you tick is still small, but the area that takes your tap is now 44 pixels square, for each row and for the header's "Select all". With a mouse nothing changes. The header row of the table is a little taller on touch (61 pixels, from 41 to 57), and body rows do not move because they were already 61 pixels tall for the row menu. The Project Explorer's resize handle now sits inside the "Project Explorer" navigation landmark, so a screen reader that moves by landmark reaches it there.
