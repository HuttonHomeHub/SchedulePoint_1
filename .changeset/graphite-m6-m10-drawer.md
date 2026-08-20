---
'@repo/web': minor
---

Graphite M6–M10 — the activity editor moves out of a modal dialog and into the trailing context
drawer, so a planner can edit an activity and still see the diagram it sits in. Pressing **Edit**,
**Report progress** or **Steps** on a selected activity now opens the drawer; below 1024px, where a
drawer would have to cover the stage, the dialog is still the right chrome and is what you get.

The plan also gains a **status bar** — activities, data date, project finish, the critical count, and
whether a recalculation is running. `Recalculate` stops being a button that doubles as a status.

The Gantt's grid pane becomes **draggable**: drag the divider and the activity-name column takes the
difference, rather than the columns sliding over the bars. The floor is what the visible columns
actually need, so it tracks the columns you have chosen to show.

Two defects fixed on the way, both of which only appeared once the product was driven rather than
unit-tested. Closing the drawer or the editor inside it dropped keyboard focus to the page body,
which also silently disabled every keyboard shortcut in the workspace; focus now returns to the rail
button that reopens the panel. And the editor's tab rail was sized against the window rather than
against the panel it was in, leaving about 90px for the fields it labels — the tabs are a horizontal
strip in the drawer.
