---
'@repo/web': minor
---

Move the weighted-steps editor into the tabbed activity editor's Progress tab (ADR-0060 M4), beside
the physical % complete it overrides — the two were previously in separate dialogs, reachable one at
a time, with no cue that one silently won. The panel is pen-gated to match the server assertion added
in M0, and its focus choreography now also covers reordering: moving a step to either end of the list
used to disable the button just pressed and drop focus to the document body.
