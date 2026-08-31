---
'@repo/web': patch
---

Undoing a deleted activity now **restores it** rather than re-creating it, so its dependencies come
back with it and the audit log's `activity.deleted` gets the `activity.restored` that pairs with it.
The re-create was ADR-0048's conservative rule from before the id-stable restore endpoint existed;
it minted a new id, which is not the endpoint any link referenced.

Alongside it, five smaller repairs to the activity editor and its neighbours:

- The **Progress** tab carries the unsaved-changes dot its five neighbours carry, so switching away
  with an unsaved weighted step no longer looks like nothing is at stake.
- The two **create forms** — Add a link, Assign a resource — shade their fields read-only with the
  reason, instead of accepting a whole form's input and refusing at the last click.
- Removing a dependency lands focus on the two link tables rather than at the top of the panel.
- **Add note** puts the cursor in the composer instead of on the dialog's close button.
- The unsaved-work confirmation reads as English past two scopes, and leads with the count past four.
