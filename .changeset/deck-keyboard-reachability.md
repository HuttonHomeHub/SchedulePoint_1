---
'@repo/web': minor
---

Fix a keyboard-reachability failure on the plan's command deck (WCAG 2.2 §2.1.1, level A).

Focusing the deck's activity-search field made it the roving tab stop, and the deck's key handler
handed every navigation key to the caret — so eighteen of the surface's twenty-seven commands had no
keyboard route at all until the page was reloaded. The veto is now per key rather than per element:
a single-line field keeps the horizontal keys and Home/End for its caret, and the vertical arrows
stay with the toolbar as the route out.

Also adds the deck's first unit suite and a browser journey that folds and unfolds a command group
from the keyboard, which is how the defect was found.
