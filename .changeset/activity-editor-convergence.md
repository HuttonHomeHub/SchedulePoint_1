---
'@repo/web': minor
---

One activity is now one surface: Logic, Resources and Notes are tabs of the activity editor
(ADR-0062).

The row menu used to open the editor for three of its five items and a separate modal for the other
two, so moving between an activity's duration and its predecessors meant closing one dialog and
opening another. Worse, the Logic dialog's "Add predecessor" / "Add successor" buttons opened a
**third** dialog on top of it — to do the thing that surface exists for.

- **Logic** and **Resources** are tabs, rendering the same panels the dialogs render, so the two can
  never drift. **Notes** get a tab of their own, and the toolbar's **Add note** now lands on it
  directly instead of opening the Logic dialog and scrolling three panels down.
- **Adding a link is inline**, below the two tables, with the new row appearing above the form as
  its confirmation. Direction is now a field that says what each choice means, rather than a fact
  carried by which of two buttons you pressed.
- **Nothing about permissions changes.** Adding a link or an assignment still needs the role and the
  edit lock, exactly as it did from the dialogs; notes still need neither. Where you cannot write,
  the section is shown with the reason rather than hidden.
- Adding a link is now undoable, matching removing one.
- The tabs are ordered by subject — what the activity is, what it depends on, what does the work,
  how it is going, what it costs, what people said.

Set `VITE_ACTIVITY_EDITOR_CONVERGENCE=false` to send every entry point back to the dialogs.
