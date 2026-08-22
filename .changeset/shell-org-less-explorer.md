---
'@repo/web': patch
---

The app shell no longer offers the Project Explorer on the three authenticated screens that have
no organisation. `/onboarding`, `/account` and `/me/activity` each rendered a ~300 px panel reading
"Select an organisation to browse" — on `/onboarding` beside the card asking the reader to create
their first organisation, where there is nothing to select by definition. The panel, its rail
button and its below-`lg` sheet are withheld together, and the reader's persisted panel width and
open/closed preference are left untouched by the trip.
