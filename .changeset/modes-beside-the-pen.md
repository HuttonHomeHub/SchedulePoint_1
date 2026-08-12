---
'@repo/web': minor
---

The scheduling mode (`Early | Visual`) and the view switch (`Diagram | Gantt`) move out of the
toolbar's first row and onto the plan's identity line, beside **Start editing** — because that is
what they are. Neither _does_ anything: they set how everything below them behaves, which is exactly
the relationship the pen control already has to the toolbar. All four gain an icon.

They render as a third toolbar rather than as four hand-built buttons, so they keep roving arrow-key
focus, group labelling, the shaded-with-a-reason treatment and the pointer-target gate — each of
which this project has recorded shipping wrong once when rebuilt by hand.

The four buttons look and behave exactly as before; only where they sit has changed. The overflow
menu's radio/checkbox handling for these items is now unreachable on this surface (the mode row
shrink-wraps to its content and can never overflow) and is deliberately kept, because a future
width-constrained row would need it.
