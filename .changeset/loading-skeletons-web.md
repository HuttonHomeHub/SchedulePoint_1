---
'@repo/web': minor
---

Loading states now say what they are loading, once. The inline "Calculating float paths…", "Loading
revisions…", "Loading plans…", "Comparing…", "Checking the plan…" and "Loading the plan's
activities…" indicators announce their own sentence to a screen reader instead of a generic
"Loading…" beside text nobody heard, and the page-loading screen's announcement now sits outside the
busy region so it cannot be held back. Loading placeholders keep an outline in Windows High Contrast
instead of disappearing. A table that is still loading now shows its real column headings, and its
fixed-width columns start at the width they will have, so the columns no longer slide sideways when
the rows arrive.
