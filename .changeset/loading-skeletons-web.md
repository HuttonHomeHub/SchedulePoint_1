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
The staff console's panels show the shape of what is loading — the Mail figures, the settings list and
the account and activity tables — instead of a spinner each, and the page no longer announces once
per panel.
A client or project page now opens in its own frame, with the real column headings of its table, and
the plan opens in a workspace-shaped placeholder instead of a spinner, so nothing slides into place
when the page arrives.
Earned value, the schedule summary, notes, history, a calendar's exceptions and a summary's members tab
show the shape of what they are loading, with one spoken sentence, instead of a spinner.
