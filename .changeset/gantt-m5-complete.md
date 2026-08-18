---
'@repo/web': minor
---

The Gantt remembers how you left it, and its rows can be restructured.

Sort a column, choose which columns the grid shows, collapse the phases you are
not reading — and it all survives a reload and a shared link, because it lives in
the URL rather than in the page. A **Predecessors** column joins the chooser,
showing each activity's logic as text (off by default, so no chart grows a column
overnight).

The row menu gains **Indent** and **Outdent**, which file a row under the summary
above it or move it one level out. Indent deliberately does not turn the row
above into a summary the way P6 does: in SchedulePoint a summary carries no
logic, so that gesture would silently strip every link on it. It files under an
existing summary instead, and says plainly when there is none.

**Insert activity below** opens the create dialog with the row's section already
chosen — beside the row rather than inside it, because "below" in a grid means
the next line at the same level.

The keyboard-shortcuts sheet now opens in the Gantt, listing that view's own keys
— F2, Enter, Escape, Tab, `Alt+←/→`, `Shift+←/→`. It previously did nothing at
all there: the sheet was part of the diagram, so pressing `?` in the chart set a
state nothing drew.
