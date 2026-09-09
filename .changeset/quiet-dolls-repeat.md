---
'@repo/web': patch
---

Stopping a performance run no longer throws away what it already measured.

The canvas-draw measurement runs at two scales. Stopping during the second discarded a complete
first one — every repeat collected, nothing about it wrong — because the recording unit was the
whole press rather than the limb. A limb that collected all its repeats is now kept and stored; one
interrupted partway is dropped rather than truncated, so a short reading can never sit in the
history looking like a full one. The Stop button says what it keeps, and the result says how many
readings were kept and that the rest were not taken.
