---
'@repo/web': patch
---

The TSLD canvas no longer freezes entirely while a bar's move or resize is being saved: pan,
wheel zoom, hover and selection stay live for the write's round trip, and a second edit grab is
refused visibly — a busy cursor over the surface and `aria-busy` on the container — instead of a
drag that runs and silently applies nothing. The naming popover still holds the canvas until it
commits, exactly as before, and the busy state clears on every settle path, including a rejected
write.
