---
'@repo/web': minor
---

Confirm before discarding unsaved work.

The app had no unload handler and no navigation blocker at all: a planner with unsaved activity
edits could reload or close the tab and lose them with no prompt. Four surfaces now declare what
they hold — the activity editor, the create dialog, the calendar form and its exceptions editor —
and a reload, a tab close or a browser navigation confirms first, naming which scopes are at risk
and saying when the work can no longer be saved because the edit lock has gone.

It also fixes a live defect. The editor's own discard confirmation named three dirty scopes while
the editor holds six — the three Progress panels each own a form — so a changed weighted step closed
in silence. It now confirms on all six.

The calendar form needed its own treatment: its seven-day working week lives outside react-hook-form
by design, so `isDirty` could never see it. A planner could rewrite every day's hours and the form
would report itself clean.
